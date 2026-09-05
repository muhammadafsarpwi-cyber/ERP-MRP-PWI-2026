export function formatApiError(error: any, fallback: string): string {
  if (!error?.response) return 'Network error. Please check your connection.';
  const { status, data } = error.response;
  const backendMsg = data?.message;
  const msg = Array.isArray(backendMsg) ? backendMsg[0] : backendMsg;
  switch (status) {
    case 400: return msg || 'Invalid request. Please check your input.';
    case 401: return 'Session expired. Please log in again.';
    case 403: return 'You do not have permission to perform this action.';
    case 404: return msg || 'Resource not found.';
    case 409: return msg || 'A conflict occurred. This record may already exist.';
    case 422: return msg || 'Validation failed. Please check your input.';
    case 500: return 'Internal server error. Please try again later.';
    default: return msg || fallback;
  }
}
