//Load the Tsugi configuration
var Config = require('tsugi-node/src/config/Config'),
    CFG = new Config ({dbport: 3306});

//Create the database. {p} token will be replaced by your  
let ddl = [
    `drop table if exists {p}attend`,

    `create table {p}attend (
        link_id     INTEGER NOT NULL,
        user_id     INTEGER NOT NULL,
        attend      DATE NOT NULL,
        ipaddr      VARCHAR(64),
        updated_at  DATETIME NOT NULL,
        CONSTRAINT \`{p}attend_ibfk_1\`
            FOREIGN KEY (\`link_id\`)
            REFERENCES \`{p}lti_link\` (\`link_id\`)
            ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`{p}attend_ibfk_\`
            FOREIGN KEY (\`user_id\`)
            REFERENCES \`{p}lti_user\` (\`user_id\`)
            ON DELETE CASCADE ON UPDATE CASCADE,
        UNIQUE(link_id, user_id, attend)
    ) ENGINE = InnoDB DEFAULT CHARSET=utf8`];

    /*That must be exectued in the correct sequence */

    CFG.pdox.queryFull(ddl[0],null,null,true)
    .then( function (){
      return CFG.pdox.queryFull(ddl[1],null,null,true).then (function (){
          console.log ('Everything was created fine!');
          process.exit();
      });
    }).catch (function (error){
        console.log (`Error creating the tables: ${error}`);
        process.exit();
    });
