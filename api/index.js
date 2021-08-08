/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const express = require('express');
const morgan = require('morgan');
const path = require('path');

const localAuth = require('../functions/auth.js');

const expressApp = express();
expressApp.use(express.json());
expressApp.use(express.urlencoded({extended: true}));
expressApp.use(morgan('dev'));
expressApp.set('view engine', 'ejs');
expressApp.set("views", path.join(__dirname, '../views'))

expressApp.get('/auth', localAuth.authCallback);
expressApp.get('/login', localAuth.loginPage);
expressApp.post('/login', localAuth.authUser);
expressApp.post('/token', localAuth.tokenCallback);


module.exports = expressApp;
