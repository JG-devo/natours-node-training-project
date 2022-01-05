// Extending the built in JS error class
class AppError extends Error {
  constructor(message, statusCode) {
    super(message); // super calls the parent constructor, message is the only parameter that the built in Error constructor accepts
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error'; // literal converts the num to string for startWith to work
    this.isOperational = true;
    // Stack trace shows more info on where the problem originated ('this' is current obj, 'this.constructor' is the AppError class)
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
