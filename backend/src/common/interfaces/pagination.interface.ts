export interface IPaginationOptions {
  page: number;
  limit: number;
  orderBy?: string;
  order?: 'ASC' | 'DESC';
}

export interface IPaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface IApiResponse<T> {
  success: boolean;
  data?: T;
  meta?: {
    total: number;
    page: number;
    limit: number;
  };
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: any[];
  };
}
