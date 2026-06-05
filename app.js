const productGrid = document.querySelector("#productGrid");
const catalog = document.querySelector("#catalog");
const template = document.querySelector("#productTemplate");
const dialog = document.querySelector("#orderDialog");
const form = document.querySelector("#orderForm");
const formStatus = document.querySelector("#formStatus");
const closeButton = document.querySelector(".close-button");
const catalogCart = document.querySelector("#catalogCart");
const cartCount = document.querySelector("#cartCount");
const productDetail = document.querySelector("#productDetail");
const detailBack = document.querySelector("#detailBack");
const detailCart = document.querySelector(".detail-cart");
const detailPrev = document.querySelector("#detailPrev");
const detailNext = document.querySelector("#detailNext");
const detailMedia = document.querySelector("#detailMedia");
const detailDots = document.querySelector("#detailDots");
const detailTitle = document.querySelector("#detailTitle");
const detailDescription = document.querySelector("#detailDescription");
const detailPrice = document.querySelector("#detailPrice");
const detailAdd = document.querySelector("#detailAdd");
const detailCartCount = document.querySelector("#detailCartCount");
const checkoutCartCount = document.querySelector("#checkoutCartCount");
const summaryTotal = document.querySelector("#summaryTotal");
const summaryItem = document.querySelector(".summary-item");
const summaryTotals = document.querySelector(".summary-totals");
const emptyCartMessage = document.querySelector("#emptyCartMessage");
const quantityInput = document.querySelector("#quantityInput");
const quantityValue = document.querySelector("#quantityValue");
const qtyMinus = document.querySelector("#qtyMinus");
const qtyPlus = document.querySelector("#qtyPlus");

const formatPrice = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0
});

let products = [];
let selectedProductIndex = 0;
let selectedImageIndex = 0;
let cartItemsCount = 0;
let cartProductId = "";

init();

async function init() {
  setCartCount(0);
  products = await fetchProducts();
  renderProducts();
  bindProductDetail();
  bindCartButtons();
  bindOrderForm();
}

async function fetchProducts() {
  const response = await fetch("/api/products");

  if (!response.ok) {
    throw new Error("Не удалось загрузить каталог");
  }

  const data = await response.json();
  return data.products || [];
}

function renderProducts() {
  productGrid.innerHTML = "";

  products.forEach((product) => {
    const card = template.content.firstElementChild.cloneNode(true);
    const button = card.querySelector(".product-button");
    const visual = card.querySelector(".product-visual");
    const title = card.querySelector(".product-title");
    const layout = product.layout || {};

    card.style.setProperty("--x", Number(layout.x || 0));
    card.style.setProperty("--y", Number(layout.y || 0));
    card.style.setProperty("--w", Number(layout.w || 320));
    card.style.setProperty("--h", Number(layout.h || 320));
    card.style.setProperty("--mobile-ratio", `${Number(layout.w || 320)} / ${Number(layout.h || 320)}`);
    title.textContent = product.name;
    button.setAttribute("aria-label", `Открыть ${product.name}`);
    button.addEventListener("click", () => openProductDetail(product.id));

    if (product.image) {
      visual.style.backgroundImage = `url("${product.image}")`;
      visual.classList.add("has-image");
    }

    productGrid.append(card);
  });
}

function bindProductDetail() {
  detailBack.addEventListener("click", closeProductDetail);
  detailPrev.addEventListener("click", () => navigateImage(-1));
  detailNext.addEventListener("click", () => navigateImage(1));
  detailAdd.addEventListener("click", handleDetailAdd);

  document.addEventListener("keydown", (event) => {
    if (productDetail.hidden) {
      return;
    }

    if (event.key === "Escape") {
      closeProductDetail();
    }

    if (event.key === "ArrowLeft") {
      navigateImage(-1);
    }

    if (event.key === "ArrowRight") {
      navigateImage(1);
    }
  });
}

function bindCartButtons() {
  [catalogCart, detailCart].forEach((button) => {
    if (!button) {
      return;
    }

    button.addEventListener("click", openCart);
  });
}

function openProductDetail(productId) {
  const index = products.findIndex((product) => product.id === productId);
  selectedProductIndex = Math.max(0, index);
  selectedImageIndex = 0;
  catalog.hidden = true;
  productDetail.hidden = false;
  document.body.classList.add("is-detail");
  renderProductDetail();
  window.scrollTo({ top: 0, behavior: "instant" });
}

function closeProductDetail() {
  productDetail.hidden = true;
  catalog.hidden = false;
  document.body.classList.remove("is-detail");
}

function navigateImage(direction) {
  const images = getProductImages(products[selectedProductIndex]);

  if (images.length <= 1) {
    return;
  }

  selectedImageIndex = (selectedImageIndex + direction + images.length) % images.length;
  renderProductDetail();
}

function renderProductDetail() {
  const product = products[selectedProductIndex];

  if (!product) {
    return;
  }

  detailTitle.textContent = product.name;
  const detailCopy = product.description || "";
  detailDescription.textContent = detailCopy;
  detailDescription.hidden = !detailCopy;
  detailPrice.textContent = formatPrice.format(product.price || 0);
  setCartCount(cartItemsCount);
  const images = getProductImages(product);
  const currentImage = images[selectedImageIndex] || "";
  detailMedia.style.backgroundImage = currentImage ? `url("${currentImage}")` : "";
  detailMedia.classList.toggle("has-image", Boolean(currentImage));
  detailMedia.setAttribute("aria-label", product.name);
  const isInCart = cartProductId === product.id && cartItemsCount > 0;
  detailAdd.textContent = isInCart ? "В корзину" : "Добавить";
  detailAdd.setAttribute(
    "aria-label",
    isInCart ? "Перейти к оформлению товара" : "Добавить товар в корзину"
  );
  const hasGallery = images.length > 1;
  detailPrev.hidden = !hasGallery;
  detailNext.hidden = !hasGallery;
  detailDots.hidden = !hasGallery;
  detailDots.innerHTML = "";

  images.forEach((_, index) => {
    const dot = document.createElement("span");
    dot.className = index === selectedImageIndex ? "active" : "";
    detailDots.append(dot);
  });
}

function handleDetailAdd() {
  const product = products[selectedProductIndex];

  if (!product) {
    return;
  }

  if (cartProductId === product.id && cartItemsCount > 0) {
    openOrder(product);
    return;
  }

  cartProductId = product.id;
  setCartCount(1);
  renderProductDetail();
}

function openCart() {
  if (cartItemsCount <= 0 || !cartProductId) {
    return;
  }

  const product = products.find((item) => item.id === cartProductId);

  if (product) {
    openOrder(product);
  }
}

function openOrder(product) {
  if (!product) {
    return;
  }

  const productIndex = products.findIndex((item) => item.id === product.id);

  if (productIndex >= 0) {
    const isCurrentProduct = products[selectedProductIndex]?.id === product.id;
    selectedProductIndex = productIndex;
    selectedImageIndex = isCurrentProduct ? selectedImageIndex : 0;
  }

  form.reset();
  formStatus.textContent = "";
  formStatus.className = "form-status";
  quantityInput.value = "1";
  quantityValue.textContent = "1";
  document.querySelector("#productId").value = product.id;
  document.querySelector("#dialogTitle").textContent = product.name;
  const dialogDescription = document.querySelector("#dialogDescription");
  const dialogDescriptionText = product.description || "";
  dialogDescription.textContent = dialogDescriptionText;
  dialogDescription.hidden = !dialogDescriptionText;
  document.querySelector("#dialogPrice").textContent = formatPrice.format(product.price);
  cartProductId = product.id;
  setCartCount(1);
  updateOrderSummary(product);

  const visual = document.querySelector("#dialogVisual");
  visual.className = "summary-visual product-visual large";
  const orderImage = getProductImages(product)[selectedImageIndex] || product.image || "";
  visual.style.backgroundImage = orderImage ? `url("${orderImage}")` : "";
  visual.classList.toggle("has-image", Boolean(orderImage));

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

function bindOrderForm() {
  closeButton.addEventListener("click", () => dialog.close());

  qtyMinus.addEventListener("click", () => adjustQuantity(-1));
  qtyPlus.addEventListener("click", () => adjustQuantity(1));

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if ((Number(quantityInput.value) || 0) < 1) {
      setStatus("Корзина пустая.", "error");
      return;
    }

    setStatus("Отправляем заказ...", "");

    const submitButton = form.querySelector(".submit-button");
    submitButton.disabled = true;

    try {
      const response = await fetch("/api/order", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(Object.fromEntries(new FormData(form)))
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Не удалось отправить заказ");
      }

      setStatus(data.message, "success");
      form.reset();
      cartProductId = "";
      setCartCount(0);

      window.setTimeout(() => {
        dialog.close();
        renderProductDetail();
      }, 1300);
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      submitButton.disabled = false;
    }
  });
}

function adjustQuantity(delta) {
  const current = Number(quantityInput.value) || 0;
  const next = Math.min(20, Math.max(0, current + delta));
  quantityInput.value = String(next);
  quantityValue.textContent = String(next);
  updateOrderSummary(products[selectedProductIndex]);
}

function setStatus(message, type) {
  formStatus.textContent = message;
  formStatus.className = `form-status ${type}`.trim();
}

function setCartCount(value) {
  cartItemsCount = Math.max(0, Number(value) || 0);

  [cartCount, detailCartCount, checkoutCartCount].forEach((element) => {
    if (!element) {
      return;
    }

    element.textContent = cartItemsCount > 0 ? String(cartItemsCount) : "";
    element.hidden = cartItemsCount <= 0;
  });
}

function updateOrderSummary(product) {
  if (!product) {
    return;
  }

  const quantity = Math.min(20, Math.max(0, Number(quantityInput.value) || 0));
  quantityInput.value = String(quantity);
  quantityValue.textContent = String(quantity);
  const isEmpty = quantity === 0;
  summaryItem.hidden = isEmpty;
  summaryTotals.hidden = isEmpty;
  form.querySelector(".submit-button").hidden = isEmpty;
  emptyCartMessage.hidden = !isEmpty;
  formStatus.textContent = "";

  if (isEmpty) {
    cartProductId = "";
    setCartCount(0);
    renderProductDetail();
    return;
  }

  cartProductId = product.id;
  setCartCount(quantity);
  const total = (Number(product.price) || 0) * quantity;
  summaryTotal.textContent = formatPrice.format(total);
  document.querySelector("#dialogPrice").textContent = formatPrice.format(total);
}

function getProductImages(product) {
  if (!product) {
    return [];
  }

  if (Array.isArray(product.images) && product.images.length) {
    return product.images.filter(Boolean);
  }

  return product.image ? [product.image] : [];
}
