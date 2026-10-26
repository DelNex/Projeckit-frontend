import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type EmailAction = 'resend_confirmation' | 'confirm_email' | 'reset_password';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetUserId } = await params;

    if (!targetUserId) {
      return NextResponse.json({ error: 'User ID is required.' }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Authenticate caller
    const {
      data: { user: caller },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !caller) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be logged in to perform this action.' },
        { status: 401 }
      );
    }

    // 2. Verify caller is approved admin
    const { data: callerProfile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, role, status, tenant_id, archived_at')
      .eq('id', caller.id)
      .maybeSingle();

    if (profileErr || !callerProfile) {
      return NextResponse.json(
        { error: 'Failed to verify administrator privileges.' },
        { status: 403 }
      );
    }

    if (callerProfile.role !== 'admin' || callerProfile.status !== 'approved' || callerProfile.archived_at) {
      return NextResponse.json(
        { error: 'Forbidden: Only approved administrators can manage user authentication.' },
        { status: 403 }
      );
    }

    // 3. Parse action
    const body = await request.json();
    const action = body.action as EmailAction;

    if (!action || !['resend_confirmation', 'confirm_email', 'reset_password'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Allowed: resend_confirmation, confirm_email, reset_password.' },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // 4. Fetch target profile
    const { data: targetProfile, error: targetErr } = await adminClient
      .from('profiles')
      .select('id, email, display_name, role, status, tenant_id')
      .eq('id', targetUserId)
      .maybeSingle();

    if (targetErr || !targetProfile || !targetProfile.email) {
      return NextResponse.json(
        { error: 'Target user profile or email not found.' },
        { status: 404 }
      );
    }

    // 5. Tenant Scoping
    if (callerProfile.tenant_id && targetProfile.tenant_id !== callerProfile.tenant_id) {
      return NextResponse.json(
        { error: 'Forbidden: You can only manage user accounts within your assigned school.' },
        { status: 403 }
      );
    }

    // 6. Execute requested email action
    let successMessage = '';

    if (action === 'confirm_email') {
      const { error: confirmErr } = await adminClient.auth.admin.updateUserById(
        targetUserId,
        { email_confirm: true }
      );

      if (confirmErr) {
        console.error('[Admin API] Failed to manually confirm email:', confirmErr);
        return NextResponse.json(
          { error: 'Failed to confirm email address. Please try again.' },
          { status: 500 }
        );
      }
      successMessage = `Email for ${targetProfile.display_name || targetProfile.email} has been manually confirmed.`;
    } else if (action === 'resend_confirmation') {
      const { error: resendErr } = await adminClient.auth.resend({
        type: 'signup',
        email: targetProfile.email,
      });

      if (resendErr) {
        console.error('[Admin API] Failed to resend confirmation email:', resendErr);
        return NextResponse.json(
          { error: 'Failed to send confirmation email. Please check server mail settings.' },
          { status: 500 }
        );
      }
      successMessage = `Confirmation email resent to ${targetProfile.email}.`;
    } else if (action === 'reset_password') {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const { error: resetErr } = await adminClient.auth.resetPasswordForEmail(
        targetProfile.email,
        {
          redirectTo: `${appUrl}/login`,
        }
      );

      if (resetErr) {
        console.error('[Admin API] Failed to send password reset:', resetErr);
        return NextResponse.json(
          { error: 'Failed to send password reset email. Please try again.' },
          { status: 500 }
        );
      }
      successMessage = `Password reset email dispatched to ${targetProfile.email}.`;
    }

    // 7. Write audit log
    try {
      await adminClient.from('audit_logs').insert({
        tenant_id: targetProfile.tenant_id || callerProfile.tenant_id || null,
        user_id: caller.id,
        action: `USER_EMAIL_${action.toUpperCase()}`,
        details: {
          target_user_id: targetUserId,
          target_email: targetProfile.email,
          action,
        },
      });
    } catch (auditErr) {
      console.error('[Admin API] Failed to write audit log:', auditErr);
    }

    return NextResponse.json({
      success: true,
      message: successMessage,
    });
  } catch (err: any) {
    console.error('[Admin API] Error in user email route:', err);
    return NextResponse.json(
      { error: 'Something went wrong processing email action. Please try again.' },
      { status: 500 }
    );
  }
}
