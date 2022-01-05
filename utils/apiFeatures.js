class APIFeatures {
  constructor(mongooseQuery, expressQueryString) {
    this.mongooseQuery = mongooseQuery;
    this.expressQueryString = expressQueryString; // coming from the route i.e. req.query
  }

  filter() {
    // 1) Filtering
    const queryObj = { ...this.expressQueryString }; // spread then re-construct object so it's a true copy of object
    const excludedFields = ['page', 'sort', 'limit', 'fields'];
    excludedFields.forEach(el => delete queryObj[el]);
    // See notes at bottom of page

    // 2) Advanced Filtering
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(
      /\b(gte|gt|lte|lt)\b/g,
      matchedWord => `$${matchedWord}`
    );
    // \b means we only want to match these exact words in parenthesis. The | means 'or'
    // g flag means it can happen more than once i.e. for a multi-query, multiple operators, etc

    this.mongooseQuery = this.mongooseQuery.find(JSON.parse(queryStr));
    // let query = Tour.find(JSON.parse(queryStr)); // let variable so can be chained together

    return this; // returns the entire object which then has access to all these methods
  }

  sort() {
    if (this.expressQueryString.sort) {
      const sortBy = this.expressQueryString.sort.split(',').join(' ');
      this.mongooseQuery = this.mongooseQuery.sort(sortBy);
      // mongoose will auto sort in ascending order. If the query includes a minus, it will sort in descending order
      // 127.0.0.1:8000/api/v1/tours?sort=price VERSUS 127.0.0.1:8000/api/v1/tours?sort=-price
      // We can also add a second field that will sort further if the price is the same, eg
      // sort(price ratingsAverage) -- just replace the comma in the query i.e.
      // 127.0.0.1:8000/api/v1/tours?difficulty=easy&sort=-price,ratingsAverage
    } else {
      this.mongooseQuery = this.mongooseQuery.sort('-createdAt _id');
    }

    return this;
  }

  limitFields() {
    if (this.expressQueryString.fields) {
      const fields = this.expressQueryString.fields.split(',').join(' ');
      this.mongooseQuery = this.mongooseQuery.select(fields); // selecting specific field names is known as projecting
      // query = query.select('name duration price')
    } else {
      this.mongooseQuery = this.mongooseQuery.select('-__v'); // respond with all data except for built-in __v field sent by mongo (using the minus)
    }

    return this;
  }

  paginate() {
    const page = this.expressQueryString.page * 1 || 1; // convert string to number with * 1, then by default we want page 1 with ||
    const limit = this.expressQueryString.limit * 1 || 100;
    const skip = (page - 1) * limit;
    // 127.0.0.1:8000/api/v1/tours?page=2&limit=10 -- page 1, 1 - 10, page 2, 11 - 20, etc
    // query = query.skip(10).limit(10);

    this.mongooseQuery = this.mongooseQuery.skip(skip).limit(limit);

    return this;
  }
}

module.exports = APIFeatures;
