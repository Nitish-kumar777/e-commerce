import Footer from "@/app/components/Footer";
import Header from "@/app/components/Header";
import { admin, adminDB } from "@/lib/firebase_admin";
import Link from "next/link";

const fetchCheckout = async (checkoutId) => {
  if (!checkoutId || typeof checkoutId !== "string") {
    throw new Error("Invalid or missing Checkout ID");
  }

  const list = await adminDB
    .collectionGroup("checkout_sessions_cod")
    .where("id", "==", checkoutId)
    .get();

  if (list.docs.length === 0) {
    throw new Error("No Checkout Found for the provided ID");
  }

  const data = list.docs[0].data();
  if (!data || typeof data !== "object") {
    throw new Error("Invalid Checkout Data Format");
  }

  return data;
};

const processOrder = async ({ checkout }) => {
  if (!checkout || typeof checkout !== "object") {
    throw new Error("Invalid Checkout Data");
  }

  const order = await adminDB.doc(`orders/${checkout.id}`).get();
  if (order.exists) {
    return false;
  }

  const uid = checkout.metadata?.uid;

  await adminDB.doc(`orders/${checkout.id}`).set({
    checkout,
    payment: {
      amount: checkout.line_items?.reduce((prev, curr) => {
        return prev + (curr?.price_data?.unit_amount || 0) * (curr?.quantity || 0);
      }, 0),
    },
    uid,
    id: checkout.id,
    paymentMode: "cod",
    timestampCreate: admin.firestore.Timestamp.now(),
  });

  const productList = checkout.line_items?.map((item) => ({
    productId: item?.price_data?.product_data?.metadata?.productId,
    quantity: item?.quantity,
  }));

  const user = await adminDB.doc(`users/${uid}`).get();

  const productIdsList = productList?.map((item) => item.productId);

  const newCartList = (user?.data()?.carts ?? []).filter(
    (cartItem) => !productIdsList.includes(cartItem?.id)
  );

  await adminDB.doc(`users/${uid}`).set(
    {
      carts: newCartList,
    },
    { merge: true }
  );

  const batch = adminDB.batch();

  productList?.forEach((item) => {
    batch.update(adminDB.doc(`products/${item.productId}`), {
      orders: admin.firestore.FieldValue.increment(item.quantity),
    });
  });

  await batch.commit();
  return true;
};

export default async function Page({ searchParams }) {
  const { checkout_id } = searchParams;

  try {
    if (!checkout_id) {
      throw new Error("Checkout ID is required");
    }

    const checkout = await fetchCheckout(checkout_id);
    const result = await processOrder({ checkout });

    return (
      <main>
        <Header />
        <section className="min-h-screen flex flex-col gap-3 justify-center items-center">
          <div className="flex justify-center w-full">
            <img src="/svgs/Mobile payments-rafiki.svg" className="h-48" alt="Order Confirmation" />
          </div>
          <h1 className="text-2xl font-semibold text-green">
            Your Order Is{" "}
            <span className="font-bold text-green-600">Successfully</span> Placed
          </h1>
          <div className="flex items-center gap-4 text-sm">
            <Link href={"/account"}>
              <button className="text-blue-600 border border-blue-600 px-5 py-2 rounded-lg bg-white">
                Go To Orders Page
              </button>
            </Link>
          </div>
        </section>
        <Footer />
      </main>
    );
  } catch (error) {
    console.error("Error processing checkout:", error.message);

    return (
      <main>
        <Header />
        <section className="min-h-screen flex flex-col justify-center items-center">
          <h1 className="text-2xl font-semibold text-red-600">
            Unable to process your request.
          </h1>
          <p className="text-gray-500">{error.message}</p>
          <Link href="/">
            <button className="text-blue-600 border px-5 py-2 rounded-lg bg-white">
              Go Back
            </button>
          </Link>
        </section>
        <Footer />
      </main>
    );
  }
}
