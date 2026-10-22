# UNext ConnectOps v39

- Product name: UNext ConnectOps, DID Manager module.
- Application primary accent #FF6600; login welcome illustration remains blue.
- Repeating, reduced-motion-safe hand wave animation.
- Six OTP inputs with automatic advancement, keyboard navigation, whole-code paste and automatic verification after six digits.
- Client-side expiry countdown from server `expires_in` (300 seconds). Server still enforces OTP expiry and five-attempt limit.
- The existing PIN/email verification API remains unchanged.

Test: sign in, paste six-digit code, auto-verification, wrong code retry, 5-minute expiry, keyboard/mobile layout.
