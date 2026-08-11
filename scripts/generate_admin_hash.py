import hashlib
salt = "vtu_calc_secure_2026"
pwd = "password123"
msg = pwd + salt
hash_obj = hashlib.sha256(msg.encode())
print("Hash for password123:", hash_obj.hexdigest())

pwd = "admin"
msg = pwd + salt
hash_obj = hashlib.sha256(msg.encode())
print("Hash for admin:", hash_obj.hexdigest())
