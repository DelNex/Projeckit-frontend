import { notFound } from 'next/navigation';
import { OmrBrowserValidation } from './validation-client';

/** Development-only route used by the Chrome OMR integration test. */
export default function OmrValidationPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <OmrBrowserValidation />;
}
