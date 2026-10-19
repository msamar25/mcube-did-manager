import getpass,hashlib,secrets
pin=getpass.getpass('Enter a new PIN (6+ digits recommended): ')
if len(pin)<6 or not pin.isdigit():raise SystemExit('Use a numeric PIN of at least 6 digits')
salt=secrets.token_bytes(16);iterations=310000
print(f'pbkdf2_sha256${iterations}${salt.hex()}${hashlib.pbkdf2_hmac("sha256",pin.encode(),salt,iterations).hex()}')
