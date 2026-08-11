import hashlib
import os
from dotenv import load_dotenv
from supabase import create_client, Client

def hash_password(pwd):
    salt = 'vtu_calc_secure_2026'
    msg = pwd + salt
    return hashlib.sha256(msg.encode()).hexdigest()

def verify_and_insert_admin():
    env_path = os.path.join(os.path.dirname(__file__), "scraper", ".env")
    load_dotenv(dotenv_path=env_path)

    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    email = "admin@gradeflow.com"
    password = "GradeFlowAdmin!2026"
    hashed_password = hash_password(password)
    
    try:
        # 1. Remove old admin
        old_email = "mohamedainan3@gmail.com"
        supabase.table("admin_users").delete().eq("email", old_email).execute()
        print(f"Removed old admin: {old_email}")
        
        # 2. Add new admin
        data = {
            "email": email,
            "password_hash": hashed_password
        }
        
        response = supabase.table("admin_users").select("*").eq("email", email).execute()
        
        if response.data:
            supabase.table("admin_users").update(data).eq("email", email).execute()
        else:
            supabase.table("admin_users").insert(data).execute()
            
        print("Success! Superadmin credentials injected into Supabase.")
        print(f"Token: GF-ADMIN-PROD")
        print(f"Email: {email}")
        print(f"Password: {password}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    verify_and_insert_admin()
