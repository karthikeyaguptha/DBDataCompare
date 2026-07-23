from db_compare import create_app


app = create_app()


if __name__ == "__main__":
    from waitress import serve

    print("DB Compare Studio is running at http://127.0.0.1:5000")
    print("Press Ctrl+C to stop.")
    serve(app, host="127.0.0.1", port=5000, threads=4)

