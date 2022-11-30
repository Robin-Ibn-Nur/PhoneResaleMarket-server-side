const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 5000;

const app = express();



// creating token with something or whatever it can be ignored
// (require('crypto').randomBytes(64).toString('hex'))

// middleware
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.h290xzo.mongodb.net/?retryWrites=true&w=majority`;
console.log(uri)
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

// this is a middleware to verify the user with jwt token
function verifyJWT(req, res, next) {

    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send('unauthorized access');
    }

    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.SECRET_ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            console.log(err)
            return res.status(403).send({ message: 'forbidden access' })
        }
        req.decoded = decoded;
        next();
    })

}


async function run() {
    try {
        const phoneResaleCollection = client.db('phoneResale').collection('brandName');
        const bookingsCollection = client.db('phoneResale').collection('bookings');
        const usersCollection = client.db('phoneResale').collection('users');
        const paymentsCollection = client.db('phoneResale').collection('payments');
        const sellerProductCollection = client.db('phoneResale').collection('sellerProduct');



        // load all brandName data to home
        app.get('/brandName', async (req, res) => {
            const query = {}
            const options = await phoneResaleCollection.find(query).toArray();
            res.send(options);
        })

        // load only brandNameCategory in add to product component
        app.get('/brandNameCategory', async (req, res) => {
            const query = {}
            const result = await phoneResaleCollection.find(query).project({ categoryName: 1 }).toArray();
            res.send(result);
        })

        // // route will show products in the same category
        app.get('/brandName/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const phones = await phoneResaleCollection.findOne(query);
            res.send(phones);
        })


        // // get orders from seller
        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            const result = await bookingsCollection.insertOne(booking);
            res.send(result);
        });

        // // get payment by id verifyJWT
        app.get('/bookings/:id', async (req, res) => {
            const id = req.params.id;
            console.log(id)
            const query = { _id: ObjectId(id) };
            const booking = await bookingsCollection.findOne(query);
            console.log(booking)
            res.send(booking);
        })


        // // this bookings route shows on my orders page /verifyJWT/
        app.get('/bookings', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const bookings = await bookingsCollection.find(query).toArray();
            res.send(bookings);
        });



        // // when user creat jwt token will found
        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, process.env.SECRET_ACCESS_TOKEN, { expiresIn: '1d' })
                return res.send({ accessToken: token });
            }
            res.status(403).send({ accessToken: '' })
        });

        // // creating users when signup
        app.put('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        // // showing allusers in all users component without admin nobody can see the users
        app.get('/users', async (req, res) => {
            const query = {};
            const users = await usersCollection.find(query).toArray();
            res.send(users);
        });


        // // verifyAdmin after
        const verifyAdmin = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);

            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }

        // // make a verify User  verifyAdmin,verifyJWT,
        app.put('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) }
            const options = { upsert: true };
            const updatedDoc = {
                $set: {
                    role: 'verified'
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc, options);
            res.send(result);
        });

        // make useAdmin hook to access
        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            console.log(email)
            const query = { email }
            const user = await usersCollection.findOne(query);
            res.send({ isAdmin: user?.role === 'admin' });
        })


        // make useSeller hook to access
        app.get('/users/seller/:email', async (req, res) => {
            const email = req.params.email;
            console.log(email)
            const query = { email }
            const user = await usersCollection.findOne(query);
            res.send({ isAdmin: user?.role === 'seller' });
        })

        // save data from add to product of seller verifyJWT, verifyAdmin,
        app.post('/sellerProduct', async (req, res) => {
            const sellerProduct = req.body;
            const result = await sellerProductCollection.insertOne(sellerProduct);
            res.send(result);
        });

        // load data to myProducts / verifyJWT,
        app.get('/sellerProduct', async (req, res) => {
            const query = {}
            const sellerProduct = await sellerProductCollection.find(query).toArray();
            res.send(sellerProduct);
        });

        // delete data from myProducts verifyAdmin/ verifyJWT, 
        app.delete('/sellerProduct/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await sellerProductCollection.deleteOne(filter);
            res.send(result);
        })

        // stripe payment method
        app.post('/create-payment-intent', async (req, res) => {
            const booking = req.body;
            const price = booking.price;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                payment_method_types: [
                    "card"
                ]
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        // update user payments into database
        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const result = await paymentsCollection.insertOne(payment);
            const id = payment.bookingId
            const filter = { _id: ObjectId(id) }
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
            const updatedResult = await bookingsCollection.updateOne(filter, updatedDoc)
            res.send(result);
        })



    }
    finally {

    }
}
run().catch(console.log);

app.get('/', async (req, res) => {
    res.send('phone resale server is running');
})

app.listen(port, () => console.log(`phone resale running on ${port}`))