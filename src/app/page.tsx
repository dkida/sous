import CookingScreen from "./cooking-screen";

export default function Home() {
  return <CookingScreen development={process.env.NODE_ENV === "development"} />;
}
