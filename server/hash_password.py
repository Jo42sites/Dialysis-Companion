import bcrypt
import sys


def main() -> None:
    if len(sys.argv) < 2:
        raise ValueError('Usage: python hash_password.py "your-strong-password"')
    password = sys.argv[1]
    if len(password) < 12:
        raise ValueError("Use a password with at least 12 characters.")
    print(bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt(rounds=12)).decode())


if __name__ == "__main__":
    try:
        main()
    except ValueError as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1) from None
