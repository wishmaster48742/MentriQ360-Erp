from datetime import datetime

from mongoengine import BooleanField, DateTimeField, Document, IntField, StringField


class UserProfile(Document):
    user_id = IntField(required=True, unique=True)
    username = StringField(max_length=150, required=True)
    email = StringField(required=True)
    role = StringField(max_length=32, default="school_admin")
    school_id = StringField(max_length=24, null=True, default=None)
    phone_number = StringField(max_length=20, default="")
    gender = StringField(max_length=20, default="")
    date_of_birth = StringField(default="")
    address = StringField(default="")
    city = StringField(max_length=100, default="")
    state = StringField(max_length=100, default="")
    pincode = StringField(max_length=20, default="")
    blood_group = StringField(max_length=8, default="")
    emergency_contact_name = StringField(max_length=120, default="")
    emergency_contact_phone = StringField(max_length=20, default="")
    qualification = StringField(max_length=180, default="")
    profile_photo_url = StringField(default="")
    bio = StringField(default="")
    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {
        "collection": "user_profiles",
        "indexes": ["user_id", "username", "school_id", "role"],
    }
