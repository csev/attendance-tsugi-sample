//Load all node http framework pieces
var express = require('express'),
session = require ('express-session'),
bodyParser = require('body-parser'),
multer = require('multer'),
upload = multer(),
MemStore = require('session-memory-store')(session),
app = express ();

//Promises utilites to avoid the use of callbacks
var Q = require("q");

//Load the main Tsugi object to handle all LTI processes
var Tsugi = require('tsugi-node/src/core/Tsugi');

//Load the Tsugi configuration
var Config = require('tsugi-node/src/config/Config'),
CFG = new Config ({dbport: 3306} );

//Load the basic UI helper to render the screen
var Output = require ('tsugi-node/src/UI/Output');

//Confiure Express framework (HTTP services)
app.use(session({
  secret: 'put-your-session-secret-here',
  resave: false,
  saveUninitialized: true,
  store: new MemStore()
}));

app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

//Confifure static express routes for client TSUGI UI lib dependencies
if (CFG.staticrootDir) {
  app.use (CFG.staticroot,express.static(CFG.staticrootDir));
}

//Define the routes that the tool will attend. Both will process the launching request
app.post  ('/lti', upload.array(), processLTIRequest);
app.get   ('/lti', upload.array(), processLTIRequest);

function processLTIRequest (req, res, next) {

  let start = Tsugi.requireData(CFG, req, res);

  start.then(function(launch) {
    if ( launch.complete ) {
      //Let Tsugi handle with the response
      return next();
    }

    if ( launch.success ) {
      //Execute our application logic
      executeMyApp (launch);
    }
  }).catch (function (error) {
    console.log ("Error", error);
    res.send(`
      <pre>
      There was an error executing the app : ${error}
      </pre>`);
    });
  };

  /**
  * executeMyApp function handles a simple MVC role for the app. Basic steps are:
  * 1- Read the necessary objects from the launch obtained from Tsugi
  * 2- Process the request to determine what to do next: Set a new the code,
  *    Clear the table, Save an attendance record, determine if redirect or render
  *    view.
  * 3- Renders the view wether is an instructor or student
  */

  function executeMyApp (launch) {

    let res = launch.response;
    let req = launch.request;

    let currentUser = launch.user;
    let link = launch.link;
    linkSettings = link.settings;

    //We recollect the old code from previous posts
    let oldCode = linkSettings.getSetting ('code') || '';

    //Create an output UI helper from launch data
    var out = new Output(launch);

    //Define the controller that decides what to do with the request data
    var processController = function () {
      var defered = Q.defer();

      if (req.body && req.body.code && req.body.set && currentUser.instructor) {
        linkSettings.setSetting ('code',req.body.code);
        out.flashSuccess ('Code updated');
        defered.resolve('redirect');

      } else if (req.body &&  req.body.clear && currentUser.instructor) {

        let query = {
          sql : `DELETE from {p}attend where link_id = :linkId`,
          params: {
            'linkId': link.id
          }
        };

        CFG.pdox.queryChanged (query.sql,query.params)
        .then (function () {
          out.flashSuccess ('Data cleared');
          defered.resolve('redirect');
        }).catch (function (error){
          defered.reject ();
        });
      } else if (req.body && req.body.code) {
        if (oldCode === req.body.code) {
          let query = {
            sql :
            `INSERT INTO {p}attend
            (link_id, user_id, ipaddr, attend, updated_at)
            VALUES ( :linkId, :userId, :ip, NOW(), NOW() )
            ON DUPLICATE KEY UPDATE updated_at = NOW()
            `,
            params: {
              'linkId': link.id,
              'userId': currentUser.id,
              'ip': req.ip
            }
          };

          CFG.pdox.queryChanged (query.sql,query.params)
          .then (function (){
            out.flashSuccess(`Attendance Recorded...`);
            defered.resolve('redirect');
          }).catch (function (error){
            console.log ('error' + error);
          });
        } else {
          out.flashError (`Code incorrect`);
          defered.resolve('redirect');
        }
      } else {
        //Paint the normal view
        defered.resolve ('process');
      }
      return defered.promise;
    }


    processController() //Call the controller to be processed
    .then (function (action){  //Once controller has decided what to do

      if (action==='redirect'){
        res.redirect ('./lti');
        return;
      }

      /** Take advantage of Tsugi UI helper to render HTML structure: header, body,
      * messages ...
      */

      out.header();
      out.bodyStart();
      out.flashMessages();


      //Print the form to send the code
      let htmlOutput = `
      <form method="POST">
      `;

      if (currentUser.instructor){
        htmlOutput +=
        `
        <label for="code">Enter code: <input type="text" name="code" value="${oldCode}" /> </label>
        <input type="submit" class="btn btn-normal" name="set" value="Update the code" />
        <input type="submit" class="btn btn-warnig" name="clear" value="Clear the data" />
        `;
      } else {
        htmlOutput += `
        <label for="code">Enter code: <input type="text" name="code" value="" /> </label>
        <input type="submit" class="btn btn-normal" name="set" value="Record Attendance"><br/>
        `;
      }

      htmlOutput += `</form>`;

      //If user is instructor render the attendance tables, if not instead flush
      // the htmlOutput.

      if (currentUser.instructor) {
        let query = {
          sql : `SELECT user_id,attend,ipaddr FROM {p}attend
          WHERE link_id = :linkId ORDER BY attend DESC, user_id`,
          params : {
            'linkId' : link.id
          }
        };


        CFG.pdox.allRowsDie (query.sql,query.params)
        .then (function (rows) {
          htmlOutput += `
          <div class="table-responsive">
          <table class="table">
          `;

          rows.forEach (function (row) {
            htmlOutput += `
            <tr>
            <td>${row.user_id}</td>
            <td>${row.attend}</td>
            <td>${row.ipaddr}</td>
            </tr>
            `;
          });

          htmlOutput +=`
          </table>
          </div>`;
          res.write (htmlOutput);
          out.footerStart();
          out.footerEnd();
          res.end();
        })
        .catch (function (error) {
          console.log (error);
          res.end();
        });
      } else {
        res.write (htmlOutput);
        out.footerStart();
        out.footerEnd();
        res.end();
      }

    });

  }

  console.log("Test application at url: http://localhost:3000/lti?key=12345&secret=secret");
  console.log("LTI test harness at https://online.dr-chuck.com/sakai-api-test/lms.php");

  app.listen(3000);
