// STREAMLINING TRY CATCH FOR ASYNC FUNCTIONS
// We wrap createTour in a catchAsync function, then when initially called on load returns / assigns fn to createTour
// When express needs the function, createTour is called (which is now the fn function)
// Without returning the anon function, the fn function would have no way of knowing the values for the args
// Without returning the anon function, createTour would be called immediately, we need to wait until express calls it

module.exports = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};
