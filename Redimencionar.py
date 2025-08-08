from PIL import Image
from tkinter import Tk, filedialog
import os

# Esconde a janela principal do Tkinter
Tk().withdraw()

# Abre seletor de imagem
file_path = filedialog.askopenfilename(
    title="Selecione uma imagem PNG",
    filetypes=[("Imagens PNG", "*.png")]
)

if file_path:
    img = Image.open(file_path)

    # Redimensiona sem suavizar (ideal pra pixel art)
    resized = img.resize((96, 96), Image.NEAREST)

    # Salva com "_96x96" no nome
    dir_name, file_name = os.path.split(file_path)
    name, ext = os.path.splitext(file_name)
    save_path = os.path.join(dir_name, f"{name}_96x96.png")
    resized.save(save_path)

    print(f"Imagem redimensionada salva em: {save_path}")
else:
    print("Nenhuma imagem selecionada.")
