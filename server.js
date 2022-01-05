const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: './config.env' });

/////////////////////////////////////////////////////////
// CATCHING UNCAUGHT EXCEPTIONS / ERRORS / BUGS
// All errors or bugs that occur in the synchronous code.
// Needs to appear before the application starts otherwise it won't fire off for events that appear before this one

process.on('uncaughtException', err => {
  console.log(err.name, err.message);
  console.log('Unhandled Exception. Shutting down...');
  process.exit(1); // Can exit immediately as non-async code doesn't have anything to handle
});

const app = require('./app');

// Environment variables don't have anything to do with express, but more to do with node.js
// Node and express apps can run in different environments - the most important are the production and development environment
// There are other environments like debugging or logging, etc
// In summary, environment variables are global variables used to define the environment in which node is running

// console.log(app.get('env')); // shows 'development' in the log (the default)
// console.log(process.env); // shows a lot of internal variables that node uses

// We can set the variable in terminal with 'NODE_ENV=development nodemon server.js'
// But the best way to set up env variables is with a .env file (see config.env and npm package dotenv)

////////////////////////////////////////////////////////////////////////
// START SERVER

const DB = process.env.DATABASE.replace(
  '<PASSWORD>',
  process.env.DATABASE_PASSWORD
);

mongoose.connect(DB).then(() => console.log('DB connection successful'));
// If using a local DB, you can replace (DB) with 'process.env.DATABASE_LOCAL'

const port = process.env.PORT || 3000;

// Mandatory to listen to port variable via env and not just a port number for Heroku
const server = app.listen(port, () => {
  console.log(`App running on port ${port}...`);
});

/////////////////////////////////////////////////////////
// HANDLING REJECTION ERRORS FOR ASYNC CODE
// Whenever there is an unhandled rejection (async) somewhere in our application (i.e. promise), the process object will emit an object called 'unhandledRejection'. We can subscribe to that event. This applies to any unhandled promises across the app, like a safety net.

process.on('unhandledRejection', err => {
  console.log(err.name, err.message); // provided by the object
  console.log('Unhandled rejection. Shutting down...');
  server.close(() => {
    // close() is a graceful way to allow the server to complete any tasks before shutting down
    process.exit(1); // immediately turns off node, 0 would mean success, 1 would mean 'uncalled exception'
  });
});
