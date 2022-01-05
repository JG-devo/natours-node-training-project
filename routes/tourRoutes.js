const express = require('express');
const tourController = require('../controllers/tourController');
const authController = require('../controllers/authController');
// const reviewController = require('../controllers/reviewController'); // Nested routes - simple version 1
const reviewRouter = require('./reviewRoutes');

//////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////

// Creating a router as middleware (each router is a sub or mini application)
const router = express.Router();

// SIMPLE NESTED ROUTES

// Example of what we are trying to do:
// POST /tour/234utri343/reviews
// GET /tour/234utri343/reviews
// GET /tour/234utri343/reviews/659tur3982

// :tourId is passed to reviewController createReview with req.params.tourId
// First option is to call the review controller in the tour router, but it means having duplicate code and doesn't make much sense

// router
//   .route('/:tourId/reviews')
//   .post(
//     authController.protect,
//     authController.restrictTo('user'),
//     reviewController.createReview
//   );

// Second option is to mount the review Router here, and say if this specific route is encountered, use this route
// Same as what appears in app.js for the API route, just a different route being specified here (re-routing).
// This decouples and separates Tours from Reviews

router.use('/:tourId/reviews', reviewRouter);

// MIDDLEWARE
// Middleware specific to this route only (i.e. not produced for the users route)
// router.param('id', tourController.checkID);

router
  .route('/top-5-cheap')
  .get(tourController.aliasTopTours, tourController.getAllTours);

router.route('/tour-stats').get(tourController.getTourStats);

router
  .route('/monthly-plan/:year')
  .get(
    authController.protect,
    authController.restrictTo('admin', 'lead-guide', 'guide'),
    tourController.getMonthlyPlan
  );

// GEOSPATIAL QUERIES (FINDING TOURS WITHIN RADIUS)
// We could do this with a query string, but this is cleaner and a standard way when querying a lot of options i.e
// /tours-within?distance=200&center=-40,45&unit=mi
// /tours-within/233/center/-45,40/unit/mi

router
  .route('/tours-within/:distance/center/:latlng/unit/:unit')
  .get(tourController.getToursWithin);

router.route('/distances/:latlng/unit/:unit').get(tourController.getDistances);

router
  .route('/')
  .get(tourController.getAllTours) // could have also added catchAsync.js function here i.e. catchAsync(tourController.getAllTours)
  .post(
    authController.protect,
    authController.restrictTo('admin', 'lead-guide'),
    tourController.createTour
  ); // But some functions may not be async, so can create hard to find bugs

router
  .route('/:id') // the router variable has the root URL, so '/' points to the root URL specifically
  .get(tourController.getSingleTour)
  .patch(
    authController.protect,
    authController.restrictTo('admin', 'lead-guide'),
    tourController.uploadTourImages,
    tourController.resizeTourImages,
    tourController.updateTour
  )
  .delete(
    authController.protect,
    authController.restrictTo('admin', 'lead-guide'),
    tourController.deleteTour
  );

module.exports = router;

// Another way of writing it without chaining

// app.get('/api/v1/tours', getAllTours);
// app.post('/api/v1/tours', createTour);
// app.get('/api/v1/tours/:id', getSingleTour);
// app.patch('/api/v1/tours/:id', updateTour);
// app.delete('/api/v1/tours/:id', deleteTour);
