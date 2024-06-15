import "dotenv/config.js";
import {MongoClient, ObjectId} from "mongodb";
import createError from "http-errors";
import express from "express";
import path, { resolve } from "path";
import cookieParser from "cookie-parser";
import logger from "morgan";
import indexRouter from "./routes/index.js";
import redis from "redis";
import { title } from "process";

// Constants
const port = process.env.PORT || 3000;

const client = new MongoClient(process.env.MONGOURI);

let redisClient;

(async () => {
  redisClient = redis.createClient();

  redisClient.on("error", (error) => console.error(`Error : ${error}`));

  await redisClient.connect();
})();

// Create http server
const app = express();

// view engine setup
app.set("views", path.join("views"));
app.set("view engine", "pug");

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join("public")));

app.use("/", indexRouter);

app.get("/mongo/", (req, res) => {
  moviesLimits(req,res);
})

app.get("/mongo/:id", (req, res) => {
  oneMovie(req,res);
})

app.patch("/mongo/:id", (req, res) => {
  updateMovie(req,res);
})

app.delete("/mongo/:id", (req, res) => {
  deleteMovie(req,res);
})

async function moviesLimits(req, res) {
  
  try{
    const key = req.body.action;
  
    let redisCache = await redisClient.get(key);

    if (redisCache){
      console.log("cache hit");
      redisCache= JSON.parse(redisCache);
      res.send({
        data:redisCache
      })
      return;
    }
    console.log("cache miss");

    await client.connect();
    console.log("Connected to the MongoDB database");

    const db = client.db(process.env.MONGODBNAME);

    const movies =await db
    .collection("movies")
    .find()
    .limit(10)
    .project({title:1})
    .toArray();

    // write to redis cache

    redisClient.setEx(key,3600,JSON.stringify(movies));
    

    res.send({
      data:movies
    })
    // return movies;
  }
  catch(err){
    console.log(err);
  }
  finally{
    await client.close();
  }
}
// console.log(await moviesLimits());

async function oneMovie(req,res) {
  
  try{
    const key = req.params.id;
    
    console.log(key);
    let redisCache = await redisClient.get(key);
    

    if (redisCache){
      console.log("cache hit");
      redisCache= JSON.parse(redisCache);
      res.send({
        data:redisCache
      })
      return;
    }
    console.log("cache miss");

    await client.connect();
    console.log("Connected to the MongoDB database");

    const db = client.db(process.env.MONGODBNAME);

    const movies =await db
    .collection("movies")
    .findOne({_id: new ObjectId('573a1391f29313caabcd7a34')},{projection :{title:1}})
    
    redisClient.setEx(key,3600,JSON.stringify(movies));
   

    return movies;
  }
  catch(err){
    console.log(err)
  }
  finally{
    await client.close();
  }
}
//  console.log(await oneMovie())

async function updateMovie(req,res) {
  
  try{

    const key = req.params.id;
    const modification = req.body.action;
    
    console.log(key);
    
    
    await client.connect();
    console.log("Connected to the MongoDB database");

    const db = client.db(process.env.MONGODBNAME);

    const movies =await db
    .collection("movies")
    .updateOne({_id: new ObjectId(key)},{ $set: {title:modification}});
    console.log(movies);
    

    if(movies.modifiedCount === 1){

      const updateMovie = await db.collection("movies").findOne({_id: new ObjectId(key)},{projection :{title:1}});
      await redisClient.del(key);
      await redisClient.setEx(key,3600,JSON.stringify(updateMovie))
      res.send({
        data: updateMovie
      })
   
    }
    else{
      res.status(404).send("not successful");
     }
    
    return movies;
  }
  catch(err){
    console.log(err)
  }
  finally{
    await client.close();
  }
}
//  console.log(await updateMovie())

async function deleteMovie(req,res) {
  
  try{

    const key = req.params.id;
    
    console.log(key);


    await client.connect();
    console.log("Connected to the MongoDB database");

    const db = client.db(process.env.MONGODBNAME);

    const movies =await db
    .collection("movies")
    .deleteOne({_id: new ObjectId(key)});
    
    if(movies.deletedCount === 1){

      await redisClient.del(key);
      res.send({
        data: "movie deleted successfully"
      })
   
    }
    else{
      res.status(404).send("not successful");
     }

    redisClient.del(`movie:${key}`);
    console.log("movie deleted")

    return movies;
  }
  catch(err){
    console.log(err)
  }
  finally{
    await client.close();
  }
}

// console.log(await deleteMovie() )



// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

// Start http server
app.listen(port, () => {
  console.log(`Server started at http://localhost:${port}`);
});
