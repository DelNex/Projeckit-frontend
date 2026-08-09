import * as AuthApi from './api/auth-api.js';
import { ConfigStore } from './stores/config-store.js';

const USER_PROFILE_EVENT = 'deped_set_user_profile';
const AUTH_STATE_EVENT = 'deped_auth_state_changed';

function persistProfile(profile) {
  const cfg = ConfigStore.get() || {};
  cfg.userProfile = profile || null;
  ConfigStore.saveLocal(cfg);
  window.dispatchEvent(new CustomEvent(USER_PROFILE_EVENT, { detail: profile }));
}

function dispatchAuthState(loggedIn) {
  window.dispatchEvent(new CustomEvent(AUTH_STATE_EVENT, { detail: { loggedIn } }));
}

export const AuthService = {
  async init() {
    try {
      const session = await this.getSession();
      if (session?.authenticated && session.user) {
        persistProfile({
          id: session.user.id,
          email: session.user.email,
          name: session.user.displayName || session.user.email,
          role: session.user.role || session.user.roleId,
        });
        dispatchAuthState(true);
        return { authenticated: true, user: session.user };
      }
    } catch (error) {
      console.warn('[AuthService] Backend session check failed or offline; checking cached session', error);
      const cached = ConfigStore.get()?.userProfile;
      if (cached) {
        dispatchAuthState(true);
        return { authenticated: true, user: cached };
      }
    }

    persistProfile(null);
    dispatchAuthState(false);
    return { authenticated: false };
  },

  async requireAuthentication() {
    const session = await this.init();
    if (!session.authenticated) {
      window.location.href = '/login.html';
      return null;
    }
    return session;
  },

  async redirectAuthenticated() {
    const session = await this.init();
    if (session.authenticated) {
      window.location.href = '/index.html';
      return true;
    }
    return false;
  },

  async login(credentials) {
    const result = await AuthApi.login(credentials);
    if (result?.success) {
      await this.init();
    }
    return result;
  },

  async register(details) {
    return AuthApi.register(details);
  },

  async logout() {
    const result = await AuthApi.logout();
    persistProfile(null);
    dispatchAuthState(false);
    return result;
  },

  async getSession() {
    return AuthApi.getSession();
  },

  async forgotPassword(email) {
    return AuthApi.forgotPassword(email);
  },

  async resetPassword(token, newPassword) {
    return AuthApi.resetPassword(token, newPassword);
  },
};
