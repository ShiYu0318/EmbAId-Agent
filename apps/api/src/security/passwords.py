from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

_hasher = PasswordHasher()

MIN_PASSWORD_LENGTH = 10


class WeakPasswordError(ValueError):
    pass


def validate_password(password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise WeakPasswordError(f"password must be at least {MIN_PASSWORD_LENGTH} characters")
    if password.isalpha() or password.isdigit():
        raise WeakPasswordError("password must mix letters with numbers or symbols")


def hash_password(password: str) -> str:
    validate_password(password)
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False
    return True


_DUMMY_HASH = _hasher.hash("embaid-dummy-password-0")


def verify_dummy(password: str) -> None:
    """Spend the same hashing time as a real check so unknown emails are not revealed."""
    verify_password(_DUMMY_HASH, password)


def needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)
