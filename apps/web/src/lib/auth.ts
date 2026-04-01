import { getSession as authGetSession } from 'auth-astro/server';

export const getSession = async (request: Request) => {
  return authGetSession(request);
};
