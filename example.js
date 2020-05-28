// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';

const axios = require('axios');
const qs = require('querystring');
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const {
  WebhookClient
} = require('dialogflow-fulfillment');
const {
  Card,
  Suggestion
} = require('dialogflow-fulfillment');

async function getSalesforceToken() {
  //would have used env vars for this in prod
  const data = {
    "grant_type": "password",
    "client_id": "3MVG98_Psg5cppyZPqMGHWyL2.A.REDACTED",
    "client_secret": "REDACTED",
    "username": "REDACTED",
    "password": "REDACTED"
  };
  const url = "https://login.salesforce.com/services/oauth2/token";
  const config = {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    }
  };

  try {
    const response = await axios.post(url, qs.stringify(data), config);
    console.log(response.data.access_token);
    return response.data.access_token;
  } catch (error) {
    console.error(error);
  }
}

process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({
    request,
    response
  });
  console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
  console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

  function welcome(agent) {
    // nothing for now;
  }

  function fallback(agent) {
    agent.add(`I didn't understand`);
    agent.add(`I'm sorry, can you try again?`);
  }

  function googleHandler(agent) {
    const phrase = agent.parameters.query ? agent.parameters.query :
      agent.parameters["geo-country"] ? agent.parameters["geo-country"] :
      agent.parameters["geo-city"];
    return axios.get(`https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&titles=${phrase}&formatversion=2&exsentences=10&exlimit=1&explaintext=1`)
      .then((result) => {
        if (result.data.query.pages[0].extract) {
          let regex = /(=)+|(\\n)+/g;
          let text = result.data.query.pages[0].extract.replace(regex, '');
          console.log(text);
          agent.add(`looking up results for ${text}. ${result.data.query.pages[0].extract}, anything else I can do for you?`);
        } else {
          agent.add('Please bear with me, but I could not find what you were looking for, please speak slower and make sure to use singular keywords');
        }
      })

      .catch((err) => {
        console.log(`welcome catch ${err}`);
        agent.add('Please bear with me, but I could not find what you were looking for, please speak slower and make sure to use singular keywords');
      });
  }

  async function seeContactHandler(agent) {
    return axios({
        method: 'get',
        url: `https://um4.salesforce.com/services/data/v44.0/query/?q=Select+phone+from+contact+where+name+like+'%25${agent.parameters.contact_name}%25'+order+by+LastModifiedDate+desc+limit+1`,
        headers: {
          "Authorization": `Bearer ${await getSalesforceToken()}`
        }
      })
      .then((result) => {
        console.log(result.data.records[0].Phone);
        result.data ? agent.add(`Hi!,  ${agent.parameters.contact_name} phone is ${result.data.records[0].Phone}`) :
          agent.add('I am sorry, I could not find a phone for this one');
      })
      .catch((err) => {
        console.log(`welcome catch ${err}`);
        agent.add('I am sorry, I have no results for this one');
      });
  }

  async function addContactHandler(agent) {
    //contact_name, contact_phone

    return axios({
        method: 'post',
        url: `https://um4.salesforce.com/services/data/v20.0/sobjects/Contact`,
        headers: {
          Authorization: `Bearer ${await getSalesforceToken()}`,
          "Content-Type": "application/json"
        },

        data: {
          FirstName: agent.parameters.contact_name,
          LastName: agent.parameters.contact_last_name,
          Phone: agent.parameters.contact_phone
        }

      })
      .then((result) => {
        console.log('then');
        console.log(result.data);
        result.data.success ? agent.add(`Your contact ${agent.parameters.contact_name} ${agent.parameters.contact_last_name} was created, anything else I can do for you?`) :
          agent.add('I could not add this contact, please try again');
      })
      .catch((err) => {
        console.log('enter catch');
        console.log(err);
        agent.add('I could not add this contact, please try again');
      });

  }

  function gamesHandler(agent) {
    return axios({
        method: 'get',
        url: `https://api-football-v1.p.rapidapi.com/v2/fixtures/live`,
        headers: {
          "x-rapidapi-key": "REDACTED"
        }
      })
      .then((result) => {
        let string = 'hello, ';
        if (result.data.api.results == 0) {
          agent.add(`no games at the moment, how else can I do you service?`);
        } else {
          result.data.api.fixtures.forEach((item) => {
            console.log(item);
            string += `in ${item.league.country}, at ${item.elapsed} minutes, ${item.homeTeam.team_name}, ${item.goalsHomeTeam}, ${item.awayTeam.team_name}, ${item.goalsAwayTeam}. `;
          });
          console.log(`string${string}`);
          agent.add(` ${string} How else can I do you service?`);
        }
      })
      .catch((err) => {
        console.log(`welcome catch ${err}`);
        agent.add(agent.request_.body.queryResult.fulfillmentText);
      });

  }


  let intentMap = new Map();
  intentMap.set('Default Welcome Intent', welcome);
  intentMap.set('Default Fallback Intent', fallback);
  intentMap.set('google', googleHandler);
  intentMap.set('seeContact', seeContactHandler);
  intentMap.set('addcontact', addContactHandler);
  intentMap.set('games', gamesHandler);



  agent.handleRequest(intentMap);
});
