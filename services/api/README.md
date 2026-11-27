# SETUVYUHA API

Backend API service for the **SETUVYUHA** hackathon project, built with FastAPI.

## Project Structure

```text
services/api/
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── core/
│   ├── models/
│   ├── schemas/
│   ├── routes/
│   ├── inventory/
│   └── fulfilment/
├── tests/
├── requirements.txt
├── README.md
└── .gitignore
```

## Prerequisites (Windows)

- Python 3.11 or higher (verify with `python --version`)
- `pip` package manager

## Local Setup (Windows PowerShell)

1. Navigate to the API directory:

```powershell
cd services\api
```

2. Create a virtual environment:

```powershell
python -m venv .venv
```

3. Activate the virtual environment:

```powershell
.\.venv\Scripts\Activate.ps1
```

> If PowerShell blocks script execution, allow local scripts for the current session:
>
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
> .\.venv\Scripts\Activate.ps1
> ```
>
> Alternatively, in Command Prompt (`cmd.exe`):
>
> ```cmd
> .venv\Scripts\activate.bat
> ```

4. Upgrade `pip` and install dependencies:

```powershell
python -m pip install --upgrade pip
pip install -r requirements.txt
```

## Running the API Server

Start the development server with Uvicorn from `services\api`:

```powershell
uvicorn app.main:app --reload
```

Once running:

- **Health endpoint:** `http://127.0.0.1:8000/health`
- **Swagger UI docs:** `http://127.0.0.1:8000/docs`
- **ReDoc docs:** `http://127.0.0.1:8000/redoc`

## Running Tests

Run the test suite from `services\api`:

```powershell
pytest
```
