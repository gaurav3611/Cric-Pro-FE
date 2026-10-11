import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withHashLocation } from '@angular/router';

import { routes } from './app.routes';
import { authTokenInterceptor } from './core/api.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Addresses look like /#/dashboard/live. Everything after the # stays in the browser, so
    // the app works on any static host without a rule that sends unknown paths to index.html.
    provideRouter(routes, withHashLocation(), withComponentInputBinding()),
    provideHttpClient(withFetch(), withInterceptors([authTokenInterceptor])),
  ],
};
