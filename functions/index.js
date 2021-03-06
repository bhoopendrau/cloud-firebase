//import firebase functions modules
const functions = require('firebase-functions');
//import admin module
const admin = require('firebase-admin');
const { Change } = require('firebase-functions');
admin.initializeApp(functions.config().firebase);

exports.pushNotification = functions.region('asia-south1').firestore.document('ChatData/{chatId}').onWrite(async (Change, context)=>{
        //  Grab the current value of what was written to the Realtime Database.
        //console.log(Change.after.data());
        const valueObject = Change.after.data();
        const sender = valueObject.sender;
        const time = valueObject.timeStamp;
        var senderName = '';
        var fcmToken = "";
        var customerId = valueObject.customerId;
        var shopId = valueObject.shopId;
        var type = "";
        
        const customerSideList = admin.firestore().collection('CustomerSideList').doc(customerId).collection('sender').doc(shopId);
        const shopSideList = admin.firestore().collection('ShopSideList').doc(shopId).collection('sender').doc(customerId)

        let [customerSnap, shopSnap, customerSideSnap, shopSideSnap] = await Promise.all([admin.firestore().collection('Users').doc(customerId).get(), 
            admin.firestore().collection('Users').doc(shopId).get(), 
            customerSideList.get(), shopSideList.get()])

        var customerlist = {
            name: shopSnap.data().Name,
            mobile: shopSnap.data().mobileNo,
            timeStamp: time,
            unreadByCustomer: 0,
            userId : shopId
        }
        var shopList = {
            name: customerSnap.data().Name,
            mobile: customerSnap.data().mobileNo,
            timeStamp: time,
            unreadByShop: 0,
            userId : customerId
        }

        if (sender == 'Customer') {
            type = "CustomerSender";
            senderName = customerSnap.data().Name;
            fcmToken = shopSnap.data().fcmToken;

        } else {
            type = "ShopSender"
            senderName = shopSnap.data().Name;
            fcmToken = customerSnap.data().fcmToken;
        }

        if (!shopSideSnap.data()) {
            if (sender == "Customer") {
                var tmp = shopList
                tmp.unreadByShop = 1;
                shopSideList.set(tmp);
            } else {
                
                customerSideList.set({
                    name: shopSnap.data().Name,
                    mobile: shopSnap.data().mobileNo,
                    timeStamp: time,
                    unreadByCustomer: admin.firestore.FieldValue.increment(1),
                    userId : shopId
                })
                shopSideList.set(shopList);    
            }
        } else {
            if (sender == "Customer") {
                var tmp = shopList
                tmp.unreadByShop = admin.firestore.FieldValue.increment(1);
                shopSideList.update(tmp);
            } else {
                shopSideList.update(shopList);    
            }
        }


        if (!customerSideSnap.data()) {
            if (sender == "Customer") {
                customerSideList.set(customerlist);
            } else {
                var tmp02 = customerlist;
                tmp02.unreadByCustomer = 1;
                customerSideList.set(tmp02);  
            }
        } else {
            if (sender == "Customer") {
                customerSideList.update(customerlist);
            } else {
                var tmp02 = customerlist;
                tmp02.unreadByCustomer = admin.firestore.FieldValue.increment(1);
                customerSideList.update(tmp02);   
            }
        }
       

        // Create a notification
        const payload = {
            data: {
                title:senderName,
                type: type,
                message: valueObject.message,
            }
        };

        //Create an options object that contains the time to live for the notification and the priority
        const options = {
            priority: "high",
            timeToLive: 60 * 60 * 24
        };


        //return admin.messaging().sendToTopic("pushNotifications", payload, options);
        return admin.messaging().sendToDevice(fcmToken, payload, options);
    });




exports.agentAllot = functions.region('asia-south1').firestore.document('OngoingAgentAllot/{allotId}').onUpdate(async (Change, context)=>{
    const valueObject = Change.after.data();
    const agentId = valueObject.agentId;
    const orderDocId = valueObject.orderDocId;
    const orderId = valueObject.orderId;
    console.log("Assignment update detected");
    if (valueObject.status == true){
        const allotSnap = await admin.firestore().collection('OngoingAgentAllot').where('orderId', "==" ,orderId).get()
        allotSnap.forEach(element => {
            admin.firestore().collection('OngoingAgentAllot').doc(element.id).delete();
        });
        admin.firestore().collection('Orders').doc(orderDocId).update({
            agentAssigned: true,
            agentAssignedId: agentId,
            agentStatus:"ASSIGNED",
            status:"CONFIRMED"
        });
        admin.firestore().collection('Agents').doc(agentId).update(
            {ongoingOrders: admin.firestore.FieldValue.increment(1)}
            )



        return true;
    } else {
        return true;
    } 
});

exports.agentRequest = functions.region('asia-south1').firestore.document('OngoingAgentAllot/{allotId}').onCreate(async (Change, context)=>{
    if (Change.data()) {
        const valueObject = Change.data();
        const agentId = valueObject.agentId;
        const orderId = valueObject.orderId;
        console.log("New assignment detected");
        const agentFcm = valueObject.agentFcm;
    
        // Create a notification
        const payload = {
            data: {
                title:'New assignment available',
                type: "AgentAllot",
                orderId: orderId,
                dataId: valueObject.docId.toString()
            }
        };

        //Create an options object that contains the time to live for the notification and the priority
        const options = {
            priority: "high",
            timeToLive: 5
        };
        return admin.messaging().sendToDevice(agentFcm, payload, options);
    
    } else {
        return true;
    }
    
});



exports.orderNotification = functions.region('asia-south1').firestore.document('Orders/{orderDocId}').onUpdate(async (Change, context)=>{
    if (Change.after.data() && Change.before.data()) {
        const valueObject = Change.after.data();
        console.log("Order change Detected");
        const status = valueObject.status;
        console.log(status);
        var sendTitle = '';
        var sendType = '';
        var sendFcmTo = '';


        


        if (status == "ORDER REQUESTED" ) {
            sendTitle = valueObject.customerName;
            sendType = 'OrderRequestUpdated';
            sendFcmTo = valueObject.shopFCM;
        } else if (status == "PROCESSING") {
            sendTitle = valueObject.shopName;
            if (valueObject.type == 'initByShop') {
                sendType = 'BillUpdated'
            } else {
                sendType = 'RequestAccepted';
            }
            sendFcmTo = valueObject.customerFCM;
        } else if (status ==  "CONFIRMED" ) {
            sendTitle = valueObject.customerName;
            sendType = 'BillAccepted';
            sendFcmTo = valueObject.shopFCM;
        } else if (status ==  "PICKED UP" ) {
            sendTitle = valueObject.shopName;
            sendType = 'PickedUp';
            sendFcmTo = valueObject.customerFCM;
        } else if (status == "REJECTED") {
            if (valueObject.rejectedBy == "Customer") {
                sendTitle = valueObject.customerName;
                sendType = 'RejectedByCustomer';
                sendFcmTo = valueObject.shopFCM;
            } else {
                sendTitle = valueObject.shopName;
                sendType = 'RejectedByShop';
                sendFcmTo = valueObject.customerFCM;
            }
        } else if (status == "Order Accepted" ) {
            sendTitle = valueObject.customerName;
            sendType = 'BillAccepted';
            sendFcmTo = valueObject.shopFCM;
        } else {
            sendType = 'OrderDeliveredForShop';
            sendTitle = valueObject.orderNo;
            sendFcmTo = valueObject.shopFCM;
            // Create a notification
            const payload = {
                data: {
                    title:sendTitle,
                    type: sendType,
                    orderId: valueObject.orderNo.toString(),
                }
            };

            //Create an options object that contains the time to live for the notification and the priority
            const options = {
                priority: "high"
            };
            admin.messaging().sendToDevice(sendFcmTo, payload, options);

            sendType = 'OrderDelivered';
            sendTitle = valueObject.orderNo;
            sendFcmTo = valueObject.customerFCM;
        }

        // Create a notification
        const payload = {
            data: {
                title:sendTitle,
                type: sendType,
                orderId: valueObject.orderNo.toString(),
            }
        };

        //Create an options object that contains the time to live for the notification and the priority
        const options = {
            priority: "high"
        };
    
        
        return admin.messaging().sendToDevice(sendFcmTo, payload, options);
    
    } else {
        return true;
    }
    
});

exports.newOrderNotifications = functions.region('asia-south1').firestore.document('Orders/{orderDocId}').onCreate(async (Change, context)=>{
    if (Change.data()) {
        const valueObject = Change.data();
        console.log("Order change Detected");
        const status = valueObject.status;
        var sendTitle = '';
        var sendType = '';
        var sendFcmTo = '';


        if (valueObject.type == "initByShop") {
            sendTitle = valueObject.shopName;
            sendType = 'BillSent';
            sendFcmTo = valueObject.customerFCM;
        } else {
            sendTitle = valueObject.customerName;
            sendType = 'CustomerOrderRequest';
            sendFcmTo = valueObject.shopFCM;
        }

    
        // Create a notification
        const payload = {
            data: {
                title:sendTitle,
                type: sendType,
                orderId: valueObject.orderNo.toString(),
            }
        };

        //Create an options object that contains the time to live for the notification and the priority
        const options = {
            priority: "high"
        };
        return admin.messaging().sendToDevice(sendFcmTo, payload, options);
    
    } else {
        return true;
    }
    
});



exports.orderNoGenerator = functions.region('asia-south1').firestore.document('OrderPlaceholder/{orderDocId}').onUpdate(async (Change, context)=>{
    if (Change.after.data()) {
        const valueObject = Change.after.data();
        valueObject.createdAt =  admin.firestore.FieldValue.serverTimestamp()
        console.log("Order Placeholder");
        return admin.firestore().collection('Orders').doc().set(valueObject);
    
    } else {
        return true;
    }
    
});

//const functions = require("firebase-functions");

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
