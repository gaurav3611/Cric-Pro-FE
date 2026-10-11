/** What the login form says for each Firebase error code. The texts are the original ones. */
export function loginErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'auth/user-not-found':
      return 'No account found with this email';
    case 'auth/wrong-password':
      return 'Incorrect password';
    case 'auth/invalid-email':
      return 'Invalid email address';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait and try again.';
    default:
      return 'Login failed. Please try again.';
  }
}

/** What the registration form says for each Firebase error code. */
export function registerErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists';
    case 'auth/invalid-email':
      return 'Invalid email address';
    case 'auth/weak-password':
      return 'Password is too weak (min 6 characters)';
    default:
      return 'Registration failed. Please try again.';
  }
}
