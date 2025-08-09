from cryptography.fernet import Fernet
print('cle_fernet :',Fernet.generate_key().decode())
