module.exports = async function health(context, _req) {
  context.res = {
    status: 200,
    body: {
      status: "ok"
    }
  };
};
