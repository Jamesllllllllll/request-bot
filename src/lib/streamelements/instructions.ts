function escapeCSharpStringLiteral(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export function buildStreamElementsTipRelayCode(relayUrl: string) {
  const escapedRelayUrl = escapeCSharpStringLiteral(relayUrl);

  return `using System;
using System.Net.Http;
using System.Text;
using Newtonsoft.Json;

public class CPHInline
{
  private static readonly HttpClient httpClient = new HttpClient
  {
    Timeout = TimeSpan.FromSeconds(15)
  };

  public bool Execute()
  {
    if (!args.ContainsKey("tipUsername") || !args.ContainsKey("tipAmount"))
    {
      return false;
    }

    string tipUsername = args["tipUsername"]?.ToString() ?? string.Empty;
    if (string.IsNullOrWhiteSpace(tipUsername))
    {
      return false;
    }

    object tipAmount = args["tipAmount"];
    string tipCurrency = args.ContainsKey("tipCurrency")
      ? args["tipCurrency"]?.ToString() ?? string.Empty
      : string.Empty;
    string tipMessage = args.ContainsKey("tipMessage")
      ? args["tipMessage"]?.ToString() ?? string.Empty
      : string.Empty;
    string deliveryId = args.ContainsKey("eventId")
      ? args["eventId"]?.ToString() ?? string.Empty
      : string.Empty;

    var payload = new
    {
      eventId = deliveryId,
      username = tipUsername,
      displayName = tipUsername,
      amount = tipAmount,
      currency = tipCurrency,
      message = tipMessage,
      status = "success",
      approved = "approved"
    };

    string json = JsonConvert.SerializeObject(payload);
    var content = new StringContent(json, Encoding.UTF8, "application/json");
    HttpResponseMessage response = httpClient.PostAsync("${escapedRelayUrl}", content)
      .GetAwaiter()
      .GetResult();

    if (!response.IsSuccessStatusCode)
    {
      CPH.LogError($"RockList.Live tip relay failed: {(int)response.StatusCode} {response.ReasonPhrase}");
      return false;
    }

    return true;
  }
}`;
}
