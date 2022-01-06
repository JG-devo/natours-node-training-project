const path = require('path');
const express = require('express');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const cors = require('cors');

const AppError = require('./utils/appError');
const globalErrorHandler = require('./controllers/errorController');
const tourRouter = require('./routes/tourRoutes');
const userRouter = require('./routes/userRoutes');
const reviewRouter = require('./routes/reviewRoutes');
const bookingRouter = require('./routes/bookingRoutes');
const viewRouter = require('./routes/viewRoutes');

const app = express();

app.enable('trust proxy'); // For heroku to allow proxy forwarding, see authController createSendToken with x-forwarded-proto

// SSR using pug templates (npm install pug)
// set is for settings
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views')); // path is built in node module which is used to manipulate path names

////////////////////////////////////////////////////////////////////////
// GLOBAL MIDDLEWARE (this is what the app.js file is mainly used for)
// Implement CORS - simple usage i.e.GET and POST
app.use(cors()); // Access-Control-Allow-Origin *

// app.use(
//   cors({
//     origin: 'https://www.natours.com', // If the API is only to be used by our frontend app for example
//   })
// );

// CORS preflight check (used for more complex calls like delete and patch)
app.options('*', cors()); // options is the same as GET, PATCH, etc - just another verb based on the call type
// app.options('/api/v1/tours/:id', cors()); // For specific routes for example

// Serving static files
// app.use(express.static(`${__dirname}/public`));
// this is why we can access css/style.css and other files from public in pug templates (almost like a route handler)
app.use(express.static(path.join(__dirname, 'public')));

// Set security headers
app.use(helmet()); // Put it in the beginning to make sure the headers are set

// dev logging
if (process.env.NODE_ENV === 'development') {
  // the process (config.js) is loaded at server start so we can access it anywhere in the project
  app.use(morgan('dev'));
}

// Limit requests from same API
const limiter = rateLimit({
  max: 100,
  windowMs: 60 * 60 * 1000,
  message: 'Too many requests. Please try again in 60mins',
});

app.use('/api', limiter);

// Body parser i.e. reading data from the body into req.body (10 kilobyte limit)
app.use(
  express.json({
    limit: '10kb',
  })
);

// URL encoded parser - used for changing the name and email on rendered account page, captures data from the account.pug form
app.use(
  express.urlencoded({
    extended: true, // allows more complex data (if required)
    limit: '10kb',
  })
);

// Cookie parser - get the data from cookies

app.use(cookieParser());

// Once data enters, we can then sanitize
// Data sanitization against NOSQL query injection
app.use(mongoSanitize());

// Data sanitization against XSS
app.use(xss());

// Prevent parameter pollution (duplicating parameters like sort will cause an error, this solves that)
app.use(
  hpp({
    whitelist: [
      'duration',
      'ratingsQuantity',
      'ratingsAverage',
      'maxGroupSize',
      'difficulty',
      'price',
    ], // allow more than one duration as that's expected
  })
);

app.use(compression());

// Example - creating our own middleware
// This middleware will apply to each and every request because we didn't specify any route
// It has to appear before any route handlers that you want to use, because route handlers end the request/response cycle
// Middleware functions are executed in the order they are in the code

// app.use((req, res, next) => {
//   console.log('hello from the middleware :P');
//   next(); //always have to use next() in middleware
// });

app.use((req, res, next) => {
  req.requestTime = new Date().toISOString();
  // console.log(req.headers); // To review how JWT are sent via headers (authorization: 'Bearer <token>')
  // console.log(req.cookies);
  next();
});

////////////////////////////////////////////////////////////////////////
// ROUTES - all run in order and execute if found, otherwise move on if not found
// PUG RENDER ROUTES

app.use('/', viewRouter);

// API ROUTES
app.use('/api/v1/tours', tourRouter); // almost like a 'parent' route
app.use('/api/v1/users', userRouter); // known as mounting the routes
app.use('/api/v1/reviews', reviewRouter);
app.use('/api/v1/bookings', bookingRouter);

////////////////////////////////////////////////////////////////////////
// Handling routes that don't exist with middleware function

app.all('*', (req, res, next) => {
  // .all means all verbs i.e. get(), post, patch(). '*' means all urls not handled by above routes

  // res.status(404).json({
  //   status: 'fail',
  //   message: `Can't find ${req.originalUrl} on this server!`,
  // });

  // const err = new Error(`Can't find ${req.originalUrl} on this server!`);
  // err.status = 'fail';
  // err.statusCode = 404;

  // whatever we pass into next(), express will assume is an error and therefore stops code execution at that point.
  // It then sends the error to the global error handling middleware, skipping all other middleware in the stack
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

////////////////////////////////////////////////////////////////////////
// Global error handling middleware for operational errors (as in user input, data connection, predictable errors rather than code)
app.use(globalErrorHandler);

module.exports = app;

// https://www.natours.dev/api/v1/tours

// Manual CORS config that can be used with app.use(helmet(goes here))

// {
//   contentSecurityPolicy: {
//     directives: {
//       defaultSrc: ["'self'", 'data:', 'blob:', 'https:', 'ws:'],
//       baseUri: ["'self'"],
//       fontSrc: ["'self'", 'https:', 'data:'],
//       scriptSrc: [
//         "'self'",
//         'https:',
//         'http:',
//         'blob:',
//         'https://*.mapbox.com',
//         'https://js.stripe.com',
//         'https://m.stripe.network',
//         'https://*.cloudflare.com',
//       ],
//       frameSrc: ["'self'", 'https://js.stripe.com'],
//       objectSrc: ["'none'"],
//       styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
//       workerSrc: [
//         "'self'",
//         'data:',
//         'blob:',
//         'https://*.tiles.mapbox.com',
//         'https://api.mapbox.com',
//         'https://events.mapbox.com',
//         'https://m.stripe.network',
//       ],
//       childSrc: ["'self'", 'blob:'],
//       imgSrc: ["'self'", 'data:', 'blob:'],
//       formAction: ["'self'"],
//       connectSrc: [
//         "'self'",
//         "'unsafe-inline'",
//         'data:',
//         'blob:',
//         'https://*.stripe.com',
//         'https://*.mapbox.com',
//         'https://*.cloudflare.com/',
//         'https://index.js:*',
//         'ws://127.0.0.1:*/',
//       ],
//       upgradeInsecureRequests: [],
//     },
//   },
// }
