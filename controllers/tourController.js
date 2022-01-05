const multer = require('multer');
const sharp = require('sharp');

const Tour = require('../models/tourModel');
// See catchAsync.js for notes on how it works with try catch replacement
const catchAsync = require('../utils/catchAsync');
const factory = require('./handlerFactory');
const AppError = require('../utils/appError');

const multerStorage = multer.memoryStorage();

const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
  } else {
    cb(new AppError('Not an image! Please only upload images.', 400), false);
  }
};

// Not saved to database, but to the folder on our server
const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
});

// Single = upload.single('nameOfField') -- req.file
// Multiple with same name = upload.array('nameOfField') -- req.files
// Multiple names and options is done like the below

exports.uploadTourImages = upload.fields([
  { name: 'imageCover', maxCount: 1 },
  { name: 'images', maxCount: 3 },
]);

exports.resizeTourImages = catchAsync(async (req, res, next) => {
  if (!req.files.imageCover || !req.files.images) return next();

  // 1) Cover image
  req.body.imageCover = `tour-${req.params.id}-${Date.now()}-cover.jpeg`;
  await sharp(req.files.imageCover[0].buffer)
    .resize(2000, 1333)
    .toFormat('jpeg')
    .jpeg({ quality: 90 })
    .toFile(`public/img/tours/${req.body.imageCover}`);

  // 2) Images
  req.body.images = [];
  await Promise.all(
    req.files.images.map(async (file, i) => {
      const filename = `tour-${req.params.id}-${Date.now()}-${i + 1}.jpeg`;

      await sharp(file.buffer)
        .resize(2000, 1333)
        .toFormat('jpeg')
        .jpeg({ quality: 90 })
        .toFile(`public/img/tours/${filename}`);

      req.body.images.push(filename);
    })
  );

  next();
});

exports.aliasTopTours = (req, res, next) => {
  req.query.limit = '5';
  req.query.sort = '-ratingsAverage,price';
  req.query.fields = 'name,price,ratingsAverage,summary,difficulty';
  next();
};

exports.getAllTours = factory.getAll(Tour);
exports.getSingleTour = factory.getOne(Tour, { path: 'reviews' });

exports.createTour = factory.createOne(Tour);
exports.updateTour = factory.updateOne(Tour);
exports.deleteTour = factory.deleteOne(Tour);

exports.getTourStats = catchAsync(async (req, res) => {
  // Mongo feature but using mongoose tools
  const stats = await Tour.aggregate([
    {
      $match: { ratingsAverage: { $gte: 4.5 } },
    },
    {
      $group: {
        // allows us to group documents together using accumulators
        // _id: '$difficulty', // Start with ID as we want to specify what we want to group by (null would group all into one)
        // _id: '$ratingsAverage',
        _id: { $toUpper: '$difficulty' }, // ID is basically what we want to use to group our documents
        numTours: { $sum: 1 }, // We add 1 for each document (it accumulates as a counter for each tour passed in)
        numRatings: { $sum: '$ratingsQuantity' },
        avgRating: { $avg: '$ratingsAverage' }, // we create new field 'avgRating' and use the mongo operator $avg
        avgPrice: { $avg: '$price' },
        minPrice: { $min: '$price' },
        maxPrice: { $max: '$price' },
      },
    }, // after this point, we have to use the field names from above group to pass into a new stage. The old names are gone
    {
      $sort: { avgPrice: 1 }, // 1 for ascending, -1 for descending
    }, // We can also repeat stages as per the below
    // {
    //   $match: { _id: { $ne: 'EASY' } }, // $ne is 'not equal, so we're showing everything that is NOT easy
    // },
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      stats,
    },
  });
});

// Find out the busiest months for tours (solving a real word business problem)
exports.getMonthlyPlan = catchAsync(async (req, res) => {
  const year = +req.params.year; // 2021

  const plan = await Tour.aggregate([
    {
      $unwind: '$startDates', // unwind deconstructs an array field from the input documents to output a document for each element.
    },
    {
      $match: {
        startDates: {
          $gte: new Date(`${year}-01-01`), // format needs to be year, month, day
          $lte: new Date(`${year}-12-31`),
        },
      },
    },
    {
      $group: {
        _id: { $month: '$startDates' },
        numTourStarts: { $sum: 1 },
        tours: { $push: '$name' }, // We need an array because we could have multiple tour names.
      },
    },
    {
      $addFields: { month: '$_id' },
    },
    {
      $project: {
        _id: 0, // project, as in projector or show / hide a field. 0 is hide, 1 is show.
      },
    },
    {
      $sort: { numTourStarts: -1 },
    },
    {
      $limit: 12, // Just as a reference, we can limit how many results are shown
    },
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      plan,
    },
  });
});

// /tours-within/233/center/34.108896,-118.120627/unit/mi

// GEOSPATIAL DATA
// Also requires an index to work (see tourModel)
exports.getToursWithin = catchAsync(async (req, res) => {
  const { distance, latlng, unit } = req.params;
  const [lat, lng] = latlng.split(',');

  // mongo expects a radiant value, which is calculated by taking the distance / radius of the earth
  const radius = unit === 'mi' ? distance / 3963.2 : distance / 6378.1;

  if (!lat || !lng) {
    throw new AppError(
      'Please provide latitude and longitude in the format lat,lng.',
      400
    );
  }

  const tours = await Tour.find({
    startLocation: { $geoWithin: { $centerSphere: [[lng, lat], radius] } },
  });

  res.status(200).json({
    status: 'success',
    results: tours.length,
    data: {
      data: tours,
    },
  });
});

exports.getDistances = catchAsync(async (req, res) => {
  const { latlng, unit } = req.params;
  const [lat, lng] = latlng.split(',');

  const multiplier = unit === 'mi' ? 0.000621371 : 0.001;

  if (!lat || !lng) {
    throw new AppError(
      'Please provide latitude and longitude in the format lat,lng.',
      400
    );
  }

  // To calculate distances, geo spatial aggregation always needs $geoNear to be first in the pipeline, and the only one that exists
  // $geoNear also requires that at least one of our fields contains a geo spatial index (in tourModel)
  const distances = await Tour.aggregate([
    {
      $geoNear: {
        near: {
          type: 'Point', // the near field is geoJSON format, first mandatory field
          coordinates: [lng * 1, lat * 1], // * 1 to convert to numbers
        },
        distanceField: 'distance', // second mandatory field, the name of the field to be created and where calculations will be stored
        distanceMultiplier: multiplier, // i.e. 0.001 which is the same as dividing by 1000 to convert from meters to kms
      },
    },
    {
      $project: {
        distance: 1, // only show these fields in the output
        name: 1,
      },
    },
  ]);
  res.status(200).json({
    status: 'success',
    data: {
      data: distances,
    },
  });
});

///////////////////////////////////////////////////////////////
////////// NOTES

// const fs = require('fs');

// using Tour.find is the same as using the find() method in mongosh
// 2 ways to filter results - using an object of options

// const tours = await Tour.find({
//   duration: 5,
//   difficulty: 'easy',
// });

// Because req.query produces an object, we can use it dynamically

// const tours = await Tour.find(queryObj);

// Another filtering solution is using built in mongoose methods

// const tours = await Tour.find()
//   .where('duration')
//   .equals(5)
//   .where('difficulty')
//   .equals('easy');

// const tours = JSON.parse(
//   fs.readFileSync(`${__dirname}/../dev-data/data/tours-simple.json`)
// );

// exports.checkID = (req, res, next, val) => {
//   // params has the extra argument of value that can be used
//   console.log(`Tour ID is: ${val}`);
//   if (+req.params.id > tours.length - 1) {
//     return res.status(404).json({
//       status: 'fail',
//       message: 'Invalid ID',
//     });
//   }
//   next();
// };

// exports.checkBody = (req, res, next) => {
//   if (!req.body.name || !req.body.price) {
//     return res.status(400).json({
//       // 400 is a 'bad request'
//       status: 'fail',
//       message: 'missing name and price',
//     });
//   }
//   next();
// };

////////////////////////////////////////////////////////////////
//////// BEFORE REFACTORING 'GETALLTOURS'

// console.log(req.query);
// 127.0.0.1:8000/api/v1/tours?duration[gte]=5&difficulty=easy
// { difficulty: 'easy', duration: { gte: '5' } } -- we just need to add the mongo operator $

// BUILD THE QUERY
// // 1) Filtering
// const queryObj = { ...req.query }; // spread then re-construct object so it's a true copy of object
// const excludedFields = ['page', 'sort', 'limit', 'fields'];
// excludedFields.forEach(el => delete queryObj[el]);
// // See notes at bottom of page

// // 2) Advanced Filtering
// let queryStr = JSON.stringify(queryObj);
// queryStr = queryStr.replace(
//   /\b(gte|gt|lte|lt)\b/g,
//   matchedWord => `$${matchedWord}`
// );
// // \b means we only want to match these exact words in parenthesis. The | means 'or'
// // g flag means it can happen more than once i.e. for a multi-query, multiple operators, etc

// let query = Tour.find(JSON.parse(queryStr)); // let variable so can be chained together

// 3) Sorting
// if (req.query.sort) {
//   const sortBy = req.query.sort.split(',').join(' ');
//   query = query.sort(sortBy);
//   // mongoose will auto sort in ascending order. If the query includes a minus, it will sort in descending order
//   // 127.0.0.1:8000/api/v1/tours?sort=price VERSUS 127.0.0.1:8000/api/v1/tours?sort=-price
//   // We can also add a second field that will sort further if the price is the same, eg
//   // sort(price ratingsAverage) -- just replace the comma in the query i.e.
//   // 127.0.0.1:8000/api/v1/tours?difficulty=easy&sort=-price,ratingsAverage
// } else {
//   query = query.sort('-createdAt _id');
// }

// 3) Fields limiting
// 127.0.0.1:8000/api/v1/tours?fields=name,duration,difficulty,price
// if (req.query.fields) {
//   const fields = req.query.fields.split(',').join(' ');
//   query = query.select(fields); // selecting specific field names is known as projecting
//   // query = query.select('name duration price')
// } else {
//   query = query.select('-__v'); // respond with all data except for built-in __v field sent by mongo (using the minus)
// }

// 4) Pagination
// const page = req.query.page * 1 || 1; // convert string to number with * 1, then by default we want page 1 with ||
// const limit = req.query.limit * 1 || 100;
// const skip = (page - 1) * limit;
// // 127.0.0.1:8000/api/v1/tours?page=2&limit=10 -- page 1, 1 - 10, page 2, 11 - 20, etc
// // query = query.skip(10).limit(10);

// query = query.skip(skip).limit(limit);

// if (req.query.page) {
//   const numTours = await Tour.countDocuments();
//   if (skip >= numTours) throw 'This page does not exist';
// }
