const AppError = require('../utils/appError');

const handleCastErrorDB = err => {
  const message = `Invalid ${err.path}: ${err.value}.`;
  return new AppError(message, 400);
};

const handleDuplicateFieldsDB = err => {
  const value = Object.values(err.keyValue)[0];
  const message = `Duplicate field value: ${value}. Please use another value.`;
  return new AppError(message, 400);
};

const handleValidationErrorsDB = err => {
  const errorValues = Object.values(err.errors); // Magically calls mongoose function that gets all the messages automatically
  const message = `Invalid input data. ${errorValues.join('. ')}`;
  return new AppError(message, 400);
};

const handleJWTError = () =>
  new AppError('Invalid token. Please log in again!', 401);

const handleJWTExpired = () =>
  new AppError('Your token has expired! Please try login again', 401);

const errorDev = (err, req, res) => {
  // A) API
  if (req.originalUrl.startsWith('/api')) {
    return res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack,
    });
  }
  // B) RENDERED WEBSITE
  console.error('ERROR 💥: ', err);

  return res.status(err.statusCode).render('error', {
    title: 'Something went wrong!',
    msg: err.message,
  });
};

const errorProduction = (err, req, res) => {
  // A) API
  // A) Operational, trusted error - send message to client
  if (req.originalUrl.startsWith('/api')) {
    if (err.isOperational) {
      return res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
      });
    }
    // B) Programming or other unknown error: don't leak error details
    // 1) Log error (there are logging libraries available if needed)
    console.error('ERROR 💥: ', err);

    // 2) Send generic message
    return res.status(500).json({
      status: 'error',
      message: 'Something went wrong!',
    });
  }
  // B) RENDERED WEBSITE
  // A) Operational, trusted error - send message to client
  if (err.isOperational) {
    return res.status(err.statusCode).render('error', {
      title: 'Something went wrong!',
      msg: err.message,
    });
  }
  // B) Programming or other unknown error: don't leak error details
  // 1) Log error (there are logging libraries available if needed)
  console.error('ERROR 💥: ', err);

  // 2) Send generic message
  return res.status(err.statusCode).render('error', {
    title: 'Something went wrong!',
    msg: 'Please try again later.',
  });
};

////////////////////////////////////////////////////////////////////////
// Global error handling middleware for operational errors (as in user input, data connection, predictable errors rather than code)
// By defining 4 arguments, express automatically knows that this will be error handling middleware.
// Express will only call it when there is an error. First argument needs to be the error.

module.exports = (err, req, res, next) => {
  // console.log(err.stack); // stack trace i.e. info on where the error happened
  // Err status codes etc without codes or status are given a default
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error'; // status is error for 500, but 404 or 400, etc is 'fail'

  if (process.env.NODE_ENV === 'development') {
    errorDev(err, req, res);
  } else if (process.env.NODE_ENV === 'production') {
    let error = { ...err };
    if (err.name === 'CastError') error = handleCastErrorDB(error);
    if (err.code === 11000) error = handleDuplicateFieldsDB(error);
    if (err.name === 'ValidationError') error = handleValidationErrorsDB(error);
    if (err.name === 'JsonWebTokenError') error = handleJWTError();
    if (err.name === 'TokenExpiredError') error = handleJWTExpired();

    // Fixing the destructured err for 'check that user exists' missing err.message
    if (!error.message) return errorProduction(err, req, res);

    errorProduction(error, req, res);
  }
};
