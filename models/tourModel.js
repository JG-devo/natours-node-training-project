const mongoose = require('mongoose');
const slugify = require('slugify');
// const User = require('./userModel'); // Not required for referencing, only used when embedding (data modelling)

// The inner objects i.e. name: {} is the 'schema type options' for the required options
// We don't need STO, but if you want more features other than 'rating: Number', you need a STO
// Options like 'required' are known as validators (used to validate the data)

const tourSchema = new mongoose.Schema(
  {
    // schema object
    name: {
      type: String,
      required: [true, 'A tour must have a name'], // The second array entry is the error message (validator)
      unique: true, // Cannot have two tours with the same name. Also auto-creates an index in Mongo (see indexes tab in Compass)
      trim: true,
      maxlength: [40, 'A tour name must have 40 characters or less'], // validator - only works when runValidators: true
      minlength: [10, 'A tour name must have 10 characters or more'], // which is set on the controller functions
      // validate: [validator.isAlpha, 'Tour name must only contain characters'], // using validator.js to check string is only letters [a-zA-Z] (also fails on spaces). We don't call the function in this case.
    },
    slug: String,
    duration: {
      type: Number,
      required: [true, 'A tour must have a duration'],
    },
    maxGroupSize: {
      type: Number,
      required: [true, 'A tour must have a group size'],
    },
    difficulty: {
      type: String,
      required: [true, 'A tour must have a difficulty'],
      enum: {
        // only available for strings -- set the values that can only be used and error message (validator)
        values: ['easy', 'medium', 'difficult'],
        message: 'Difficulty is either: easy, medium, difficult',
      },
    },
    ratingsAverage: {
      type: Number,
      default: 4.5,
      min: [1, 'Rating must be more than 1.0'], // validators that work with Numbers and Dates
      max: [5, 'Rating must be below 5.0'],
      set: val => Math.round(val * 10) / 10, // Setter function that rounds the number to first decimal i.e. 4.66667 === 4.7
    },
    ratingsQuantity: {
      type: Number,
      default: 0,
    },
    price: {
      type: Number,
      required: [true, 'A tour must have a price'],
    },
    priceDiscount: {
      type: Number,
      // We can also create our own validator functions e.g making sure the price is more than the discount
      // argument could be called anything, but holds the data passed into priceDiscount
      validate: {
        validator: function (value) {
          // 'this' only points to current doc on NEW document creation (not on update)
          return value < this.price;
        },
        message: 'Discount price ({VALUE}) should be below the regular price',
        // {VALUE} is what we can use to add the actual value - bespoke to mongoose, not JS
      },
    },
    summary: {
      type: String,
      required: [true, 'A tour must have a description'],
      trim: true, // Removes all whitespace from beginning and end of string
    },
    description: {
      type: String,
      trim: true,
    },
    imageCover: {
      type: String,
      required: [true, 'A tour must have a cover image'],
    },
    images: [String],
    createdAt: {
      type: Date,
      default: Date.now(), // mongo will parse into a readable date
      select: false, // permanently exclude this field from the output
    },
    startDates: [Date],
    secretTour: {
      type: Boolean,
      default: false,
    },
    // Data modelling
    // GeoJSON is used by MongDB to specify geo-spatial data (mongo supports geo spatial data out of the box)
    // geo spatial data is the description of locations using longitude and latitude (simple points, complicated lines or polygons, etc)
    // All the data above this is part of schemaType options, whereas the object below is embedded (as a new object, not document).
    startLocation: {
      // in order to recognize this as Geo-Spatial GeoJSON, we need to specify at least two field names - type and coords properties
      // Each of these sub-fields gets its own schemaType options (nested object in type: {} and coordinates[])
      type: {
        type: String,
        default: 'Point', // We can also specify polygons, lines, etc
        enum: ['Point'], // making sure this is the only possible option
      },
      coordinates: [Number], // Expect array of numbers (longitude 1st, latitude 2nd) - Standard map apps do lat first, then long
      address: String,
      description: String,
    },
    // Embedding the location data directly into the tours as new documents (denormalized) requires an array
    // This will create brand new documents inside the parent document (Tour)
    locations: [
      {
        type: {
          type: String,
          default: 'Point',
          enum: ['Point'],
        },
        coordinates: [Number],
        address: String,
        description: String,
        day: Number,
      },
    ],
    // Option 1: embedding guide documents directly (see pre.save middleware below - marked NOT IN USE and drawbacks)
    // guides: Array,

    // Option 2: referencing users (specify array - which means each will be documents)
    // Type will then be a mongoDB _id, we need to replace the ID with the actual data (populate process, which is always a query)
    guides: [
      {
        type: mongoose.Schema.ObjectId,
        ref: 'User', //refers to userModel - no importing needed
      },
    ],
  },
  {
    // options object
    toJSON: { virtuals: true }, // required for virtual properties to show on the JSON output
    toObject: { virtuals: true }, // ditto with object output
  }
);

// SINGLE FIELD INDEX (for one field)
// If searching through lots of docs, it can be very slow. Mongo already indexes the ID field (seen under the indexes tab)
// We can create our own indexes so that when querying, its much faster and efficient
// 1 means ascending, -1 means descending order (other ordering options are available)
// This now cuts the 'totalDocsExamined' to only those that match the query (as seen with explain() on getAll function in handlerFactory.js)

// tourSchema.index({ price: 1 }); // When removing an index in code, we still need to drop the index in compass

// COMPOUND FIELD INDEX (for multiple fields)
// Will also work for each field being searched individually
tourSchema.index({ price: 1, ratingsAverage: -1 });
tourSchema.index({ slug: 1 });

// For GeoSpatial queries to work, we need to create an index for the startLocation
// For geoSpatial data, the index needs to be set to 2dsphere if the data describes real points on the earth surface
// We also have 2d for fictional points (without the sphere part)
tourSchema.index({ startLocation: '2dsphere' });

// VIRTUAL PROPERTIES
// Virtual properties are fields we can define in the schema but that don't get saved to the database (not persisted)
// It may be a calculation derived from another field i.e. converting from mph to kmh, or days to weeks like the below
// getters and setters are used because we get something out of the database each time to create this virtual prop.
// Virtual props cannot be used for queries i.e. Tour.find().sort() etc because they are not in the DB

tourSchema.virtual('durationWeeks').get(function () {
  return this.duration / 7; // 'this' is pointing to the current document
});

// Virtual Populate (an alternative to parent / child referencing)
// ForeignField is what the field is called in reviewModel
// localField is the field in this tourModel
// Doing it this way means we don't have to keep an array of all child documents on the parent. This works similarly without persisting the data to the DB, which means we don't run the risk of arrays and documents growing too large
tourSchema.virtual('reviews', {
  ref: 'Review',
  foreignField: 'tour',
  localField: '_id',
});

// DOCUMENT MIDDLEWARE - runs before .save() and .create() but NOT .insertMany() or .findByIdAndUpdate(), etc
// Mongoose also has middleware that we can use between two events, either before or after (pre() and post() hooks)
// There are 4 types of middleware in Mongoose - document, query, aggregate and model
// pre() middleware has access to next

tourSchema.pre('save', function (next) {
  this.slug = slugify(this.name, { lower: true });
  // Before this will work, we need to add the slug field to the schema
  next();
});

// Embedding guides middleware (NOT IN USE)
// Drawbacks is it only works on save, but equally each time a guide updates their info, we would need to write code that checks if a tour has a guide and then update that data (a lot of work). But this is just to show how embedding really works

// tourSchema.pre('save', async function (next) {
//   const guidesPromises = this.guides.map(async id => await User.findById(id));
//   this.guides = await Promise.all(guidesPromises);
//   next();
// });

// // We can have multiple pre() save hooks, or middlewares
// tourSchema.pre('save', next => {
//   console.log('Will save document..');
//   next();
// });

// // Post() has access to both next and the document that was just saved to the DB
// tourSchema.post('save', (doc, next) => {
//   console.log(doc);
//   next();
// });

// QUERY MIDDLEWARE - functions that can run before or after a query is executed
// The find hook makes this query middleware
// 'this' keyword will point to the current query

// tourSchema.pre('find', function (next) {
// Using a reg expression with ^ will apply to all words with find in it i.e. find(), findOne(), findByID(), etc
tourSchema.pre(/^find/, function (next) {
  this.find({ secretTour: { $ne: true } });

  this.start = Date.now();
  next();
});

// tourSchema.post(/^find/, function (docs, next) {
//   console.log(`Query took ${Date.now() - this.start} milliseconds`);
//   next();
// });

tourSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'guides',
    select: '-__v -passwordChangedAt',
  });
  next();
});

// AGGREGATION MIDDLEWARE - 'this' points to the current aggregation object
// Using regex to separate the query as this function was causing problems with distance function in tourController
// https://www.udemy.com/course/nodejs-express-mongodb-bootcamp/learn/lecture/15065562#questions/7971596
const geoSpatialOperatorTest = /^[$]geo[a-zA-Z]*/;

tourSchema.pre('aggregate', function (next) {
  const geoAggregate = this.pipeline().filter(
    stage => Object.keys(stage)[0].search(geoSpatialOperatorTest) !== -1
  );
  // console.log(this.pipeline()); // The array that we pass in with key/values
  // Unshift to add to the beginning of the array, to exclude the secret tours from aggregation
  if (geoAggregate.length === 0) {
    this.pipeline().unshift({ $match: { secretTour: { $ne: true } } });
  }
  next();
});

// Creating a model from the schema. Convention is to have capitalized word i.e. Tour that confirms we're dealing with a Model
const Tour = mongoose.model('Tour', tourSchema);

module.exports = Tour;
