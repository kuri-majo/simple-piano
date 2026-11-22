from flask import Flask

# The whole app is a static page (sound is synthesized in the browser via the
# Web Audio API), so Flask only serves files out of src/static/.
app = Flask(__name__, static_folder="static", static_url_path="")


@app.get("/")
def index():
    return app.send_static_file("index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
