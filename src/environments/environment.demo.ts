/**
 * Demo build: no Firebase at all. The placeholder key switches the app into demo mode, where
 * any email signs in and the user is kept in the browser. Used for trying the app without an
 * account and by tools/parity.mjs.
 */
export const environment = {
  production: true,
  testHooks: true,
  firebase: {
    apiKey: 'YOUR_API_KEY',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
    measurementId: '',
  },
};
