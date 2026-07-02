n=int(input("Enter a number: "))
i=0
while n>0:
    if n/i==1:
        print("The number",n," is a square number")
        break
    i = i + 1
else:
    print("The number",n," is not a square number")