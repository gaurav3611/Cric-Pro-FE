/** ng serve: real Firebase sign-in, unoptimised build. */
export const environment = {
  production: false,
  testHooks: false,
  /** Public web config of the Firebase project, the same values as Cricket/frontend/js/firebase-config.js. */
  firebase: {
    apiKey: 'AIzaSyCiv1I-SbHwUcmGlC4hrJQmxuaCEkkPhgQ',
    authDomain: 'cricpro-app.firebaseapp.com',
    projectId: 'cricpro-app',
    storageBucket: 'cricpro-app.firebasestorage.app',
    messagingSenderId: '140824187893',
    appId: '1:140824187893:web:7692545a9a2b7d91a5c6bc',
    measurementId: 'G-DLXEJ3PFR9',
  },
};
