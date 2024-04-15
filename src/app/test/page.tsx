export const dynamic = 'force-dynamic' // defaults to auto

export default async function Page() {
  let api1Data;
  try {
    const response = await fetch("http://cdksta-alb16-8bbwblbxa3xl-1750387875.ap-northeast-1.elb.amazonaws.com/api", { cache: "no-store" });
    api1Data = await response.json();
  } catch (error) {
    console.error(error);
  }

  let internalApi1Data;
  try {
    const response = await fetch("http://cdksta-alb16-8bbwblbxa3xl-1750387875.ap-northeast-1.elb.amazonaws.com/internal-api", { cache: "no-store" });
    internalApi1Data = await response.json();
  } catch (error) {
    console.error(error);
  }

  let api2Data;
  try {
    const response = await fetch("http://internal-next-js.nextjssandbox:3000/api", { cache: "no-store" });
    api2Data = await response.json();
  } catch (error) {
    console.error(error);
  }

  let internalApi2Data;
  try {
    const response = await fetch("http://internal-next-js.nextjssandbox:3000/internal-api", { cache: "no-store" });
    internalApi2Data = await response.json();
  } catch (error) {
    console.error(error);
  }

  return (
    <div>
      <p>api1Data {api1Data?.timestamp}</p>
      <p>internalApi1Data {internalApi1Data?.timestamp}</p>
      <p>api2Data {api2Data?.timestamp}</p>
      <p>internalApi2Data {internalApi2Data?.timestamp}</p>
    </div>
  )
}
