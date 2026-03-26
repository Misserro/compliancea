import { NextRequest, NextResponse } from 'next/server';

const SUPPORTED_LOCALES = ['en', 'pl'] as const;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { locale } = body;

    if (!locale || !SUPPORTED_LOCALES.includes(locale)) {
      return NextResponse.json(
        { error: 'Invalid locale. Supported: en, pl' },
        { status: 400 }
      );
    }

    const response = NextResponse.json({ locale });
    response.cookies.set('locale', locale, {
      httpOnly: true,
      path: '/',
      maxAge: 31536000, // 1 year
      sameSite: 'lax',
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
}
