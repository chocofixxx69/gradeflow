import secrets
import string
import sys

def generate_faculty_key(length=12):
    """
    Generates a secure, unique faculty access key.
    Format: VTU-<RANDOM_STRING>
    """
    characters = string.ascii_uppercase + string.digits
    random_part = ''.join(secrets.choice(characters) for _ in range(length))
    return f"VTU-FK-{random_part}"

if __name__ == "__main__":
    if len(sys.argv) > 1:
        count = int(sys.argv[1])
    else:
        count = 1
        
    print(f"Generating {count} Faculty Access Key(s):")
    print("-" * 30)
    for i in range(count):
        print(f"Key {i+1}: {generate_faculty_key()}")
    print("-" * 30)
    print("Store these keys securely in the Supabase 'faculty_keys' table.")
