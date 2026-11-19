import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';
import { OmrBrowserValidation } from './validation-client';

/** Development-only route used by the Chrome OMR integration test. */
export default function OmrValidationPage() {
  if (process.env.NODE_ENV !== 'development' && !(process.env.OMR_VALIDATION_ENABLED === 'true' && process.env.GITHUB_ACTIONS === 'true')) notFound();
  return <OmrBrowserValidation />;
}
