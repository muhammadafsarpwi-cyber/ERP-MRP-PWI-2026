export interface SupabaseUser {
  id: string;
  email?: string;
  aud?: string;
  role?: string;
}

export interface SupabaseJwtPayload {
  sub: string;
  email?: string;
  role?: string;
  aud?: string;
  exp?: number;
  iat?: number;
}
