/**
 * Test environment defaults, applied before any module reads process.env.
 *
 * TZ is deliberately NOT Asia/Kolkata: the timezone bug this project fixed
 * only reproduces when the host clock differs from IST, so the suite runs in
 * UTC to make sure a regression to local-time arithmetic fails a test rather
 * than passing on a developer laptop and breaking on deploy.
 */
process.env.TZ = 'UTC';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-testing-123456';
process.env.BUS_CAPACITY = process.env.BUS_CAPACITY || '40';
process.env.SAFETY_BUFFER_MIN = process.env.SAFETY_BUFFER_MIN || '60';
process.env.GEOFENCE_RADIUS_KM = process.env.GEOFENCE_RADIUS_KM || '5';
process.env.MAX_SUBSIDY_PCT = process.env.MAX_SUBSIDY_PCT || '50';
process.env.SUBSIDY_PER_25KM = process.env.SUBSIDY_PER_25KM || '5';
process.env.BASE_FARE = process.env.BASE_FARE || '100';
process.env.FARE_PER_KM = process.env.FARE_PER_KM || '3';
process.env.FULL_REFUND_HOURS = process.env.FULL_REFUND_HOURS || '72';
process.env.PARTIAL_REFUND_HOURS = process.env.PARTIAL_REFUND_HOURS || '24';
process.env.PARTIAL_REFUND_PCT = process.env.PARTIAL_REFUND_PCT || '50';

// Exercise the offline fallbacks rather than calling paid third parties.
delete process.env.GOOGLE_MAPS_API_KEY;
delete process.env.RAZORPAY_KEY_ID;
delete process.env.RAZORPAY_KEY_SECRET;
delete process.env.SMTP_HOST;
