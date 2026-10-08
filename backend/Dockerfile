FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY KarenderyaOrders.Api.csproj ./
RUN rm -rf /root/.nuget/packages && dotnet restore
COPY . ./
RUN dotnet publish -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app/publish .
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080
ENTRYPOINT ["dotnet", "KarenderyaOrders.Api.dll"]
