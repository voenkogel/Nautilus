// Helper function to normalize node identifiers
export const normalizeNodeIdentifier = (identifier: string): string => {
  if (!identifier) return '';
  
  // Remove protocols (http://, https://) - this is common for both backend and frontend
  let normalized = identifier.replace(/^https?:\/\//, '');
  // Remove trailing slashes
  normalized = normalized.replace(/\/+$/, '');
  

  return normalized;
};