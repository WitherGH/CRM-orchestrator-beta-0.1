import { notFound } from 'next/navigation';

export type AdminSession = {
  user: {
    id: string;
    isAdmin: true;
  };
};

export async function getAdminSession(): Promise<AdminSession | null> {
  if (process.env.NODE_ENV !== 'production') {
    return {
      user: {
        id: 'local-admin',
        isAdmin: true,
      },
    };
  }

  return null;
}

export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();

  if (!session) {
    notFound();
  }

  return session;
}
