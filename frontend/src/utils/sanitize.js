
import DOMPurify from 'dompurify';

export default (input) => DOMPurify.sanitize(String(input || ''));
